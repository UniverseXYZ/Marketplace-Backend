import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import R from 'ramda';
import {
  encodeAssetClass,
  encodeAssetData,
  encodeOrderData,
  hashOrderKey,
} from '../../common/utils/order-encoder';
import { In, Repository } from 'typeorm';
import { AppConfig } from '../configuration/configuration.service';
import {
  MatchOrderDto,
  CancelOrderDto,
  TrackOrderDto,
  OrderDto,
  CreateOrderDto,
  PrepareTxDto,
  QueryDto,
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
  Asset,
} from './order.types';
import { EthereumService } from '../ethereum/ethereum.service';
import { MarketplaceException } from '../../common/exceptions/MarketplaceException';
import { constants } from '../../common/constants';
import { Utils } from '../../common/utils';
// import { sign } from '../../common/helpers/order';
import web3 from 'web3';
import { SortOrderOptionsEnum } from './order.sort';
@Injectable()
export class OrdersService {
  private watchdogUrl;
  private logger;

  constructor(
    private readonly config: AppConfig,
    private readonly httpService: HttpService,
    private readonly ethereumService: EthereumService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {
    const watchdogUrl = R.path(['WATCHDOG_URL'], config.values);
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

    // check salt along with the signature (just in case)
    const salt = await this.getSaltByWalletAddress(data.maker);
    if (salt !== data.salt) {
      throw new MarketplaceException(constants.INVALID_SALT_ERROR);
    }

    // verify signature
    const encodedOrder = this.encode(order);
    const signerAddress = this.ethereumService.verifyTypedData(
      {
        name: 'Exchange',
        version: '2',
        chainId: this.ethereumService.getChainId(),
        verifyingContract: this.config.values.MARKETPLACE_CONTRACT,
      },
      Utils.types,
      encodedOrder,
      data.signature,
    );
    if (signerAddress.toLowerCase() !== data.maker.toLowerCase()) {
      throw new MarketplaceException(constants.INVALID_SIGNATURE_ERROR);
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
    await this.staleOrdersWithHigherPrice(savedOrder);
    this.checkSubscribe(savedOrder);
    return savedOrder;
  }

  public async prepareOrderExecution(hash: string, data: PrepareTxDto) {
    // 1. get sell/left order
    const leftOrder = await this.getOrderByHash(hash);
    if (leftOrder) {
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
        throw new MarketplaceException(
          constants.INVALID_SELL_ORDER_ASSET_ERROR,
        );
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
    } else {
      return '';
    }
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
    query.page = parseInt('' + query.page) > 1 ? parseInt('' + query.page) : 1;
    query.limit =
      parseInt('' + query.limit) > 0 &&
      Number(query.limit) <= constants.OFFSET_LIMIT
        ? parseInt('' + query.limit)
        : 12;

    const skippedItems = (query.page - 1) * query.limit;

    const queryBuilder = this.orderRepository.createQueryBuilder('order');
    queryBuilder.where('status = :status', { status: OrderStatus.CREATED });

    if (query.side) {
      queryBuilder.andWhere('side = :side', { side: Number(query.side) });
    }

    if (!!query.hasOffers) {
      // Get all buy orders
      const offers = await this.orderRepository.find({
        where: {
          side: 0,
        },
      });

      let queryText = '';

      // Search for any sell orders that have offers
      offers.forEach((offer) => {
        // Offers(buy orders) have the nft info in 'take'
        const tokenId = offer.take.assetType.tokenId;
        const contract = offer.take.assetType.contract;
        if (tokenId && contract) {
          queryText += `${queryText ? 'OR ' : ''}`;
          // Sell orders have the nft info in 'make'
          queryText += `make->'assetType'->>'tokenId' = '${tokenId}' AND make->'assetType'->>'contract' = '${contract}'`;
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
        const utcTimestamp = new Date().getTime();
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
   * Returns active sell orders
   * @param query QueryDto
   * @returns [Order[], number]
   */
  public async queryBrowsePage(query: QueryDto) {
    query.page = parseInt('' + query.page) > 1 ? parseInt('' + query.page) : 1;
    query.limit =
      Number(query.limit) > 0 && Number(query.limit) <= constants.OFFSET_LIMIT
        ? parseInt('' + query.limit)
        : 12;

    const skippedItems = (query.page - 1) * query.limit;
    const utcTimestamp = new Date().getTime();

    const queryBuilder = this.orderRepository.createQueryBuilder('order');
    queryBuilder
      .where('status = :status', { status: OrderStatus.CREATED })
      .andWhere(`(order.end = 0 OR order.end > ${utcTimestamp} )`)
      .andWhere(`order.side = ${OrderSide.SELL}`);

    if (!!query.hasOffers) {
      // Get all buy orders
      const offers = await this.orderRepository.find({
        where: {
          side: 0,
        },
      });

      let queryText = '';

      // Search for any sell orders that have offers
      offers.forEach((offer) => {
        // Offers(buy orders) have the nft info in 'take'
        const tokenId = offer.take.assetType.tokenId;
        const contract = offer.take.assetType.contract;
        if (tokenId && contract) {
          queryText += `${queryText ? 'OR ' : ''}`;
          // Sell orders have the nft info in 'make'
          queryText += `make->'assetType'->>'tokenId' = '${tokenId}' AND make->'assetType'->>'contract' = '${contract}'`;
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
   *
   * @param contract nft token address
   * @param tokenId nft token tokenId
   */
  public async fetchLastAndBestOffer(contract: string, tokenId: string) {
    if (!constants.REGEX_ETHEREUM_ADDRESS.test(contract)) {
      throw new MarketplaceException(constants.INVALID_CONTRACT_ADDRESS);
    }
    if (!constants.REGEX_TOKEN_ID.test(tokenId)) {
      throw new MarketplaceException(constants.INVALID_TOKEN_ID);
    }

    const utcTimestamp = new Date().getTime();

    const [bestOffer, lastOffer] = await Promise.all([
      this.orderRepository
        .createQueryBuilder('order')
        .where(`take->'assetType'->>'tokenId' = :tokenId`, {
          tokenId: tokenId,
        })
        .andWhere(`take->'assetType'->>'contract' = :contract`, {
          contract: contract,
        })
        .andWhere(`order.side = ${OrderSide.BUY}`)
        .andWhere(`order.end > ${utcTimestamp}`)
        .addSelect("CAST(take->>'value' as DECIMAL)", 'value_decimal')
        .orderBy('value_decimal', 'DESC')
        .getOne(),
      this.orderRepository
        .createQueryBuilder('order')
        .where(`take->'assetType'->>'tokenId' = :tokenId`, {
          tokenId: tokenId,
        })
        .andWhere(`take->'assetType'->>'contract' = :contract`, {
          contract: contract,
        })
        .andWhere(`order.side = ${OrderSide.BUY}`)
        .orderBy('order.createdAt', 'DESC')
        .getOne(),
    ]);

    return {
      bestOffer,
      lastOffer,
    };
  }

  /**
   *
   * @param collection Nft token address
   * @returns string represantation of the floor price in wei
   */
  public async getCollectionFloorPrice(collection: string) {
    if (!constants.REGEX_ETHEREUM_ADDRESS.test(collection)) {
      throw new MarketplaceException(constants.INVALID_CONTRACT_ADDRESS);
    }

    const utcTimestamp = new Date().getTime();
    const lowestOrder = await this.orderRepository
      .createQueryBuilder('order')
      .where(`order.side = ${OrderSide.SELL}`)
      .andWhere(`order.status = ${OrderStatus.CREATED}`)
      .andWhere(`order.end = 0 OR order.end < ${utcTimestamp}`)
      .andWhere(`order.start = 0 OR order.start > ${utcTimestamp}`)
      .andWhere(`LOWER(make->'assetType'->>'contract') = :contract`, {
        contract: collection.toLowerCase(),
      })
      .addSelect("CAST(take->>'value' as DECIMAL)", 'value_decimal')
      .orderBy('value_decimal', 'ASC')
      .getOne();

    if (!lowestOrder) {
      return { floorPrice: '0' };
    }

    return { floorPrice: lowestOrder.make.value };
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

  public async matchOrder(matchEvent: MatchOrderDto) {
    const leftOrder = await this.orderRepository.findOne({
      hash: matchEvent.leftOrderHash,
    });

    if (!leftOrder) {
      this.logger.error(
        `The matched order is not found in database. Order left hash: ${matchEvent.leftOrderHash}`,
      );
      return;
    }

    if (leftOrder.status !== OrderStatus.CREATED) {
      this.logger.log(
        `The matched order's status is already "${
          OrderStatus[leftOrder.status]
        }"`,
      );
      return;
    }

    this.logger.log(
      `The matched order has been found. Order left hash: ${matchEvent.leftOrderHash}`,
    );

    leftOrder.status = OrderStatus.FILLED;
    leftOrder.matchedTxHash = matchEvent.txHash;
    await this.orderRepository.save(leftOrder);

    await this.markRelatedOrdersAsStale(leftOrder, matchEvent);
  }

  private async markRelatedOrdersAsStale(
    leftOrder: Order,
    event: MatchOrderDto,
  ) {
    // Take nft info either from 'take' or 'make' depending on the tx maker.
    let orderNftInfo: Asset = null;
    let orderCreator = '';
    if (event.txFrom === event.leftMaker) {
      orderNftInfo = leftOrder.make;
      orderCreator = leftOrder.maker.toLowerCase();
    } else if (event.txFrom === event.rightMaker) {
      orderNftInfo = leftOrder.take;
      orderCreator = leftOrder.taker.toLowerCase();
    }

    // 1. Mark any buy offers as stale. They can't be executed anymore as the owner has changed
    // 2. Mark any sell offers as stale. They can't be executed anymore as the owner has changed
    const [buyOffers, sellOffers] = await Promise.all([
      this.orderRepository
        .createQueryBuilder('order')
        .where(`order.side = ${OrderSide.BUY}`)
        .andWhere(`order.status = ${OrderStatus.CREATED}`)
        .andWhere(`order.taker = '${orderCreator}'`)
        .andWhere(
          `take->'assetType'->>'contract' = '${orderNftInfo.assetType.contract}'`,
        )
        .andWhere(
          `take->'assetType'->>'tokenId' = '${orderNftInfo.assetType.tokenId}'`,
        )
        .getMany(),
      this.orderRepository
        .createQueryBuilder('order')
        .where(`order.side = ${OrderSide.SELL}`)
        .andWhere(`order.status = ${OrderStatus.CREATED}`)
        .andWhere(`LOWER(order.maker) = '${orderCreator}'`)
        .andWhere(
          `make->'assetType'->>'contract' = '${orderNftInfo.assetType.contract}'`,
        )
        .andWhere(
          `make->'assetType'->>'tokenId' = '${orderNftInfo.assetType.tokenId}'`,
        )
        .getMany(),
    ]);

    if (buyOffers.length) {
      this.logger.log(
        `Found ${buyOffers.length} buy offers related to an order match`,
      );
      buyOffers.forEach((offer) => {
        offer.status = OrderStatus.STALE;
      });
      await this.orderRepository.save(buyOffers);
    }

    if (sellOffers.length) {
      this.logger.log(
        `Found ${sellOffers.length} sell offers related to an order match`,
      );
      sellOffers.forEach((offer) => {
        offer.status = OrderStatus.STALE;
      });
      await this.orderRepository.save(sellOffers);
    }
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
    const cancelOrder = await this.orderRepository
      .createQueryBuilder('order')
      .where(
        `
        order.hash = :hash AND 
        order.maker = :maker AND 
        (order.status = :status1 OR order.status = :status2)
      `,
        {
          hash: event.leftOrderHash,
          maker: event.leftMaker,
          status1: OrderStatus.CREATED,
          status2: OrderStatus.STALE,
        },
      )
      .getOne();
    if (cancelOrder) {
      this.logger.log(
        `The Canceled order has been found. Order left hash: ${event.leftOrderHash}`,
      );

      cancelOrder.status = OrderStatus.CANCELLED;
      cancelOrder.cancelledTxHash = event.txHash;
      await this.orderRepository.save(cancelOrder);
    } else {
      this.logger.error(
        `The Cancelled order is not found in database. Request: ${JSON.stringify(
          event,
        )}`,
      );
    }
  }

  public async staleOrder(event: TrackOrderDto) {
    const { fromAddress, toAddress, address, erc721TokenId } = event;
    const matchedOne = await this.queryOne(address, erc721TokenId, fromAddress);
    if (!matchedOne) {
      this.logger.error(
        `Failed to find this order: nft: ${address}, tokenId: ${erc721TokenId}, from: ${fromAddress}, to: ${toAddress}`,
      );
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
   * This method marks an existing SELL order in the CREATED status
   * as STALE with higher price (take.value)
   * if the new order orderWithLowerPrice for the same NFT
   * has a lower or equal price (take.value)
   * @param orderWithLowerPrice
   * @returns void
   */
  private async staleOrdersWithHigherPrice(orderWithLowerPrice: Order) {
    if (OrderSide.SELL === orderWithLowerPrice.side) {
      let ordersWithHigherPrice = [];

      if (
        AssetClass.ERC721 === orderWithLowerPrice.make.assetType.assetClass ||
        AssetClass.ERC1155 === orderWithLowerPrice.make.assetType.assetClass
      ) {
        ordersWithHigherPrice = await this.orderRepository
          .createQueryBuilder('o')
          .where(
            `
            id != :id AND
            o.status = :status AND
            o.side = :side AND
            o.make->'assetType'->>'contract' = :contract AND
            (
              o.make->'assetType'->>'assetClass' = :assetClass1 OR 
              o.make->'assetType'->>'assetClass' = :assetClass2 
            ) AND
            o.make->'assetType'->>'tokenId' = :tokenId AND
            CAST(o.take->>'value' as DECIMAL) >= CAST(:newPrice as DECIMAL)
          `,
            {
              id: orderWithLowerPrice.id ?? constants.ZERO_UUID, // do not stale the new order itself
              status: OrderStatus.CREATED,
              side: OrderSide.SELL,
              contract: orderWithLowerPrice.make.assetType.contract,
              assetClass1: AssetClass.ERC721,
              assetClass2: AssetClass.ERC1155,
              tokenId: orderWithLowerPrice.make.assetType.tokenId,
              // no conversion to wei as this method expects valid order data.
              newPrice: orderWithLowerPrice.take.value,
            },
          )
          .getMany(); //getMany just in case
      } else if (
        AssetClass.ERC721_BUNDLE ===
        orderWithLowerPrice.make.assetType.assetClass
      ) {
        // @TODO Add support for ERC721_BUNDLE
      }

      for (const orderWithHigherPrice of ordersWithHigherPrice) {
        orderWithHigherPrice.status = OrderStatus.STALE;
        await this.orderRepository.save(orderWithHigherPrice);
      }
    }
  }
}
