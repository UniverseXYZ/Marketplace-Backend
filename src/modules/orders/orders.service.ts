import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import R from 'ramda';
import {
  encodeAssetClass,
  encodeAssetData,
  encodeOrderData,
  hashOrderKey,
} from '../../utils/order-encoder';
import { In, Repository, getManager } from 'typeorm';
import { AppConfig } from '../configuration/configuration.service';
import { 
  MatchOrderDto,
  CancelOrderDto,
  TrackOrderDto,
  OrderDto, 
  CreateOrderDto, 
  PrepareTxDto, 
  QueryDto 
} from './order.dto';
import { Order } from './order.entity';
import {
  OrderSide,
  OrderStatus,
  NftTokens,
  // IBundleType,
  // IAssetType,
  AssetType,
  AssetClass,
  BundleType,
} from './order.types';
import { EthereumService } from '../ethereum/ethereum.service';
import { MarketplaceException } from '../../common/exceptions/MarketplaceException';
import { constants } from '../../common/constants';
import { createTypeData } from '../../common/utils/EIP712';
import { Utils } from '../../common/utils';
// import { sign } from '../../common/helpers/order';
import web3 from 'web3';
import { SortOrderOptionsEnum } from './order.sort';
@Injectable()
export class OrdersService {
  private watchdogUrl;
  private logger;

  constructor(
    private readonly appConfig: AppConfig,
    private readonly httpService: HttpService,
    private readonly ethereumService: EthereumService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {
    const watchdogUrl = R.path(['WATCHDOG_URL'], appConfig.values);
    if (R.isNil(watchdogUrl)) {
      throw new Error('Watchdog endpoint is missing');
    }
    this.watchdogUrl = watchdogUrl;
    this.logger = new Logger(OrdersService.name);
  }

  /**
   * This method creates an order and calls this.checkSubscribe().
   * Returns the newly created order data.
   * @param data - order data
   * @returns {Object}
   */
  public async createOrderAndCheckSubscribe(data: CreateOrderDto) {
    if (!data.type || !constants.ORDER_TYPES.includes(data.type)) {
      throw new MarketplaceException(constants.INVALID_ORDER_TYPE_ERROR);
    }

    // DTO does validate unexpected properties but if it's validating a value of multiple
    // types, i didn't find the way how to account for unexpected properties of the other type.
    // This has to happen before verifying the signature!
    if (AssetClass.ERC721_BUNDLE === data.make.assetType.assetClass) {
      delete data.make.assetType.contract;
      delete data.make.assetType.tokenId;
    } else {
      delete data.make.assetType.contracts;
      delete data.make.assetType.tokenIds;
      delete data.make.assetType.bundleName;
      delete data.make.assetType.bundleDescription;
    }

    const order = this.convertToOrder(data);

    // Sell orders cannot have ETH as the asset.
    if (
      OrderSide.SELL === order.side &&
      AssetClass.ETH === order.make.assetType.assetClass
    ) {
      throw new MarketplaceException(constants.INVALID_SELL_ORDER_ASSET_ERROR);
    }

    // verify signature
    const encodedOrder = this.encode(order);
    const signerAddress = this.ethereumService.verifyTypedData(
      {
        name: 'Exchange',
        version: '2',
        chainId: await this.ethereumService.getChainId(),
        verifyingContract: this.appConfig.values.MARKETPLACE_CONTRACT,
      },
      Utils.types,
      encodedOrder,
      data.signature,
    );
    if (signerAddress.toLowerCase() !== data.maker.toLowerCase()) {
      throw new MarketplaceException(constants.INVALID_SIGNATURE_ERROR);
    }

    // check salt along with the signature (just in case)
    const salt = await this.getSaltByWalletAddress(data.maker);
    if (salt !== data.salt) {
      throw new MarketplaceException(constants.INVALID_SALT_ERROR);
    }

    // verify allowance for SELL orders
    if (
      OrderSide.SELL === order.side &&
      !(await this.ethereumService.verifyAllowance(
        data.make.assetType.assetClass,
        data.maker,
        AssetClass.ERC721_BUNDLE === data.make.assetType.assetClass
          ? data.make.assetType.contracts
          : [data.make.assetType.contract],
        AssetClass.ERC721_BUNDLE === data.make.assetType.assetClass
          ? data.make.assetType.tokenIds
          : [[data.make.assetType.tokenId]],
        data.make.value,
      ))
    ) {
      throw new MarketplaceException(constants.NFT_ALLOWANCE_ERROR);
    }
    // verify allowance for BUY orders.
    if (
      OrderSide.BUY === order.side &&
      !(await this.ethereumService.verifyAllowance(
        data.make.assetType.assetClass, //note that it's data.make !
        data.maker,
        [data.make.assetType.contract],
        [[]],
        data.make.value,
      ))
    ) {
      throw new MarketplaceException(constants.NFT_ALLOWANCE_ERROR);
    }

    const savedOrder = await this.orderRepository.save(order);
    this.checkSubscribe(savedOrder);
    return savedOrder;
  }

  public async prepareOrderExecution(hash: string, data: PrepareTxDto) {
    // 1. get sell/left order
    const leftOrder = await this.getOrderByHash(hash);
    if (leftOrder.status !== OrderStatus.CREATED) {
      throw new MarketplaceException(constants.ORDER_ALREADY_FILLED_ERROR);
    }

    // verify if maker's token got approved to transfer proxy
    if (
      !(await this.ethereumService.verifyAllowance(
        leftOrder.make.assetType.assetClass,
        leftOrder.maker,
        AssetClass.ERC721_BUNDLE === leftOrder.make.assetType.assetClass
          ? leftOrder.make.assetType.contracts
          : [leftOrder.make.assetType.contract],
        AssetClass.ERC721_BUNDLE === leftOrder.make.assetType.assetClass
          ? leftOrder.make.assetType.tokenIds
          : [[leftOrder.make.assetType.tokenId]],
        leftOrder.make.value,
      ))
    ) {
      throw new MarketplaceException(constants.NFT_ALLOWANCE_ERROR);
    }

    // check if the left order is a buy eth-order. We won't support the seller to send a eth-order.
    // @TODO check with Ryan and @Stan if it's not a bug but feature!
    if (AssetClass.ETH === leftOrder.make.assetType.assetClass) {
      throw new MarketplaceException(constants.INVALID_SELL_ORDER_ASSET_ERROR);
    }

    // 2. generate the oppsite right order
    const rightOrder = this.convertToRightOrder(data, leftOrder);

    // 3. generate the match tx
    const value = this.ethereumService.calculateTxValue(
      leftOrder.make.assetType.assetClass,
      leftOrder.make.value,
      leftOrder.take.assetType.assetClass,
      leftOrder.take.value,
    );

    const tx = await this.ethereumService.prepareMatchTx(
      this.encode(leftOrder),
      leftOrder.signature,
      this.encode(rightOrder),
      data.maker,
      value.toString(),
    );
    return tx;
  }

  /**
   * Converts the payload order data into the Order object.
   * Returns an Order object.
   * @param orderDto
   * @returns {Order}
   * @throws {MarketplaceException}
   */
  public convertToOrder(orderDto: CreateOrderDto) {
    const order = this.orderRepository.create({
      type: orderDto.type,
      maker: orderDto.maker.toLowerCase(),
      taker: orderDto.taker,
      make: orderDto.make,
      take: orderDto.take,
      salt: orderDto.salt,
      start: orderDto.start,
      end: orderDto.end,
      data: orderDto.data,
      signature: orderDto.signature,
      fill: '0',
      makeBalance: orderDto.make.value,
      makeStock: orderDto.make.value,
      status: OrderStatus.CREATED,
    });
    if (NftTokens.includes(order.make.assetType.assetClass)) {
      order.side = OrderSide.SELL;
    } else if (AssetClass.ERC20 === order.make.assetType.assetClass) {
      order.side = OrderSide.BUY;
    } else {
      throw new MarketplaceException('Invalid asset class.');
    }
    order.hash = hashOrderKey(
      order.maker.toLowerCase(),
      order.make.assetType,
      order.take.assetType,
      order.salt,
    );

    return order;
  }

  public convertToRightOrder(prepareDto: PrepareTxDto, leftOrder: Order) {
    const rightOrder = this.orderRepository.create({
      type: leftOrder.type,
      maker: prepareDto.maker.toLowerCase(),
      taker: constants.ZERO_ADDRESS,
      make: leftOrder.take,
      take: leftOrder.make,
      salt: leftOrder.salt,
      start: leftOrder.start,
      end: leftOrder.end,
      data: {
        dataType: prepareDto.revenueSplits?.length
          ? constants.ORDER_DATA
          : constants.DATA_TYPE_0X,
        revenueSplits: prepareDto.revenueSplits,
      },
    });
    return rightOrder;
  }

  // Encode Order and ready to sign
  public encode(order: OrderDto) {
    return {
      maker: order.maker.toLowerCase(),
      makeAsset: {
        assetType: {
          assetClass: encodeAssetClass(order.make.assetType.assetClass),
          data: encodeAssetData(order.make.assetType),
        },
        value: order.make.value,
      },
      taker: order.taker,
      takeAsset: {
        assetType: {
          assetClass: encodeAssetClass(order.take.assetType.assetClass),
          data: encodeAssetData(order.take.assetType),
        },
        value: order.take.value,
      },
      salt: order.salt,
      start: order.start,
      end: order.end,
      dataType: encodeAssetClass(order.data?.dataType),
      data: encodeOrderData(order.data?.revenueSplits),
    };
  }

  public async getOrderByHash(hash: string) {
    const order = await this.orderRepository.findOne({ hash });
    return order;
  }

  public async queryAll(query: QueryDto) {
    query.page = query.page || 1;
    query.limit = query.limit || 10;

    const skippedItems = (query.page - 1) * query.limit;

    const queryBuilder = this.orderRepository.createQueryBuilder('order');
    queryBuilder.where('status = :status', { status: OrderStatus.CREATED });

    if (query.side) {
      queryBuilder.andWhere('side = :side', { side: query.side });
    }

    if (!!query.hasOffers) {
      // Get all buy orders(offers)
      const offers = await this.orderRepository.find({
        where: {
          side: 0,
        },
      });

      let queryText = '';

      // Search for any sell orders that have offers
      offers.forEach((offer) => {
        if (offer.make.assetType.tokenId && offer.make.assetType.contract) {
          queryText += `${queryText ? 'OR' : ''}`;
          queryText += `take->'assetType'->>'tokenId' = '${offer.make.assetType.tokenId}' AND take->'assetType'->>'contract' = '${offer.make.assetType.contract}'`;
        }
      });

      if (queryText) {
        queryBuilder.andWhere(queryText);
      }
    }

    if (query.maker) {
      queryBuilder.andWhere('maker = :maker', {
        maker: query.maker.toLowerCase(),
      });
    }

    if (query.assetClass) {
      const queryMake = `make->'assetType'->'assetClass' = :assetClass`;
      const queryTake = `take->'assetType'->'assetClass' = :assetClass`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}))`;
      queryBuilder.andWhere(queryForBoth, {
        assetClass: `"${query.assetClass}"`,
      });
    }

    if (query.collection) {
      const queryMake = `make->'assetType'->'contract' = :collection`;
      const queryMakeBundle = `make->'assetType'->'contracts' ?| array[:collections]`;
      const queryTake = `take->'assetType'->'contract' = :collection`;
      const queryTakeBundle = `take->'assetType'->'contracts' ?| array[:collections]`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}) OR (${queryMakeBundle}) OR (${queryTakeBundle}))`;
      queryBuilder.andWhere(queryForBoth, {
        collection: `"${query.collection}"`,
        collections: `${query.collection}`,
      });
    }

    if (query.tokenId) {
      // @TODO there is no filtering by tokenId for ERC721_BUNDLE orders supposedly because of array of arrays
      const queryMake = `make->'assetType'->>'tokenId' = :tokenId`;
      const queryTake = `take->'assetType'->>'tokenId' = :tokenId`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}))`;
      queryBuilder.andWhere(queryForBoth, {
        tokenId: query.tokenId,
      });
    }

    if (query.beforeTimestamp) {
      const milisecTimestamp = Number(query.beforeTimestamp) * 1000;
      const utcDate = new Date(milisecTimestamp);

      const timestampQuery = `order.createdAt >= :date`;
      queryBuilder.andWhere(timestampQuery, {
        date: utcDate.toDateString(),
      });
    }

    if (query.token) {
      const queryTake = `take->'assetType'->>'assetClass' = :token`;

      queryBuilder.andWhere(queryTake, {
        token: query.token,
      });
    }

    if (query.minPrice) {
      const weiPrice = web3.utils.toWei(query.minPrice);

      const queryTake = `CAST(take->>'value' as DECIMAL) >= CAST(:minPrice as DECIMAL)`;

      queryBuilder.andWhere(queryTake, {
        minPrice: weiPrice,
      });
    }

    if (query.maxPrice) {
      const weiPrice = web3.utils.toWei(query.maxPrice);

      const queryTake = `CAST(take->>'value' as DECIMAL) <= CAST(:maxPrice as DECIMAL)`;

      queryBuilder.andWhere(queryTake, {
        maxPrice: weiPrice,
      });
    }

    switch (Number(query.sortBy)) {
      case SortOrderOptionsEnum.EndingSoon:
        const utcTimestamp = Math.floor(new Date().getTime() / 1000);
        queryBuilder.orderBy(
          `(case when order.end - ${utcTimestamp} >= 0 then 1 else 2 end)`,
        );
        break;
      case SortOrderOptionsEnum.HighestPrice:
        queryBuilder
          .addSelect("CAST(take->>'value' as DECIMAL)", 'value_decimal')
          .orderBy('value_decimal', 'DESC');
        break;
      case SortOrderOptionsEnum.LowestPrice:
        queryBuilder
          .addSelect("CAST(take->>'value' as DECIMAL)", 'value_decimal')
          .orderBy('value_decimal', 'ASC');
        break;
      case SortOrderOptionsEnum.RecentlyListed:
        queryBuilder.orderBy('order.createdAt', 'DESC');
        break;
      default:
        queryBuilder.orderBy('order.createdAt', 'DESC');
        break;
    }

    queryBuilder.addOrderBy('order.createdAt', 'DESC');
    const items = await queryBuilder
      .offset(skippedItems)
      .limit(query.limit)
      .getManyAndCount();

    return items;
  }

  /**
   * used to find the order which
   * @param contract nft token address
   * @param tokenId nft token tokenId
   * @param maker wallet address who is transfer the token out
   * @returns order
   */
  public async queryOne(contract: string, tokenId: string, maker: string) {
    const queryBuilder = this.orderRepository.createQueryBuilder();
    queryBuilder.where('status = :status', { status: OrderStatus.CREATED });

    queryBuilder.andWhere('side = :side', { side: OrderSide.SELL });

    queryBuilder.andWhere('maker = :maker', { maker: maker.toLowerCase() });

    const queryMake = `make->'assetType'->'contract' = :collection`;
    const queryMakeBundle = `make->'assetType'->'contracts' ?| array[:collections]`;
    const queryForBoth = `((${queryMake}) OR (${queryMakeBundle}))`;
    queryBuilder.andWhere(queryForBoth, {
      collection: `"${contract}"`,
      collections: `${contract}`,
    });

    // const queryMakeTokenId = `make->'assetType'->'tokenId' = :tokenId`;
    // queryBuilder.andWhere(queryMakeTokenId, {
    //   tokenId: `${tokenId}`,
    // });

    const results = await queryBuilder.getMany();

    if (results.length <= 0) {
      return null;
    }

    for (const order of results) {
      if (order.make.assetType.assetClass === AssetClass.ERC721_BUNDLE) {
        // in case of bundle
        // 1. check collection index
        const assetType = order.make.assetType as BundleType;
        const collectionIndex = assetType.contracts.indexOf(contract);
        // 2. find token ids array and check if tokenId is in the array
        const tokenIdArray = assetType.tokenIds[collectionIndex];
        if (tokenIdArray.includes(tokenId)) {
          return order;
        }
      } else {
        const assetType = order.make.assetType as AssetType;
        // in case of ERC721
        if (assetType.tokenId === tokenId) {
          return order;
        }
      }
    }
  }

  public async matchOrder(event: MatchOrderDto) {
    const order = await this.orderRepository.findOne({
      hash: event.leftOrderHash,
      status: OrderStatus.CREATED,
    });
    if (!order) {
      this.logger.error(
        `The matched order is not found in database. Order left hash: ${event.leftOrderHash}`,
      );
      return;
    }

    order.status = OrderStatus.FILLED;
    order.matchedTxHash = event.txHash;
    await this.orderRepository.save(order);
  }

  /**
   * Marks an order as Cancelled and sets cancelledTxHash.
   * This method is supposed to process the API call PUT /internal/orders/cancel
   * which is called by the Marketplace-Indexer.
   * @See https://github.com/UniverseXYZ/Marketplace-Indexer
   * @param event - event data from the Indexer.
   * @returns void
   */
  public async cancelOrder(event: CancelOrderDto) {
    const order = await this.orderRepository.createQueryBuilder('mi')
      .where(`
        mi.hash = :hash AND 
        mi.maker = :maker AND 
        (mi.status = :status1 OR mi.status = :status2)
      `, {
        hash: event.leftOrderHash,
        maker: event.leftMaker,
        status1: OrderStatus.CREATED,
        status2: OrderStatus.STALE,
      }).getOne();
    if(order) {
      order.status = OrderStatus.CANCELLED;
      order.cancelledTxHash = event.txHash;
      await this.orderRepository.save(order);
    } else {
      this.logger.error(`The Cancelled order is not found in database. Request: ${JSON.stringify(event)}`);
    }
  }

  public async staleOrder(event: TrackOrderDto) {
    const { fromAddress, toAddress, address, erc721TokenId } = event;
    const matchedOne = await this.queryOne(
      address,
      erc721TokenId,
      fromAddress,
    );
    if (!matchedOne) {
      this.logger.error(`Failed to find this order: nft: ${address}, tokenId: ${erc721TokenId}, from: ${fromAddress}, to: ${toAddress}`);
      return;
    }

    this.logger.log(`Found matching order by alchemy: ${matchedOne.hash}`);
    await this.orderRepository.update(
      { hash: matchedOne.hash },
      { status: OrderStatus.STALE },
    );
  }

  /**
   * Returns the "salt" for a wallet address.
   * Salt equals the number of orders in the orders table for this wallet plus 1.
   * This method does not do walletAddress validation check.
   * @param walletAddress
   * @returns {Promise<number>}
   */
  public async getSaltByWalletAddress(walletAddress: string): Promise<number> {
    let value = 1;
    const count = await this.orderRepository.count({
      maker: walletAddress.toLowerCase(),
    });
    value = value + count;

    return value;
  }

  public async checkUnsubscribe(order: Order) {
    // if we are still interested in this address, don't unsubscribe
    const pending_orders = await this.orderRepository.find({
      where: {
        hash: order.hash,
        status: In([OrderStatus.CREATED, OrderStatus.PARTIALFILLED]),
      },
      take: 2,
    });
    if (pending_orders.length === 0) {
      this.httpService
        .post(`${this.watchdogUrl}/unsubscribe/`, {
          addresses: [order.maker.toLowerCase()],
          topic: 'NFT',
        })
        .subscribe({
          next: (v) => this.logger.log(v.data),
          error: (e) => this.logger.error(e),
          complete: () => this.logger.log('complete'),
        });
    }
  }

  private async checkSubscribe(order: Order) {
    // if it is already subscribed, that's ok.
    this.httpService
      .post(`${this.watchdogUrl}/v1/subscribe`, {
        addresses: [order.maker],
        topic: 'NFT',
      })
      .subscribe({
        next: (v) => this.logger.log(v.data),
        error: (e) => this.logger.error(e),
        complete: () => this.logger.log('complete'),
      });
  }

  /**
   * @Deprecated
   * Returns order side based on order's asset class.
   * The returning valus is either 0 (left or sell order) or 1 (right or bid order).
   * @param orderDto
   * @returns order side
   * @throws {MarketplaceException}
   */
  // private getOrderSide(orderDto: OrderDto): number {
  //   let value = null;
  //   if (NftTokens.includes(orderDto.make.assetType.assetClass)) {
  //     value = OrderSide.SELL;
  //   } else if (NftTokens.includes(orderDto.take.assetType.assetClass)) {
  //     value = OrderSide.BUY;
  //   } else {
  //     throw new MarketplaceException('Invalid asset class.');
  //   }
  //   return value;
  // }
}
