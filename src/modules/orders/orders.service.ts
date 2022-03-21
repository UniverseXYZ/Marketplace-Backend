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
  CancelOrder,
  MatchOrder,
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
import { CoingeckoService } from '../coingecko/coingecko.service';
import { TOKENS, TOKEN_DECIMALS } from '../coingecko/tokens';

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
    private readonly coingecko: CoingeckoService,
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

    // Check if order for the nft already exists
    if (order.side === OrderSide.SELL) {
      const existingOrder = await this.orderRepository
        .createQueryBuilder('order')
        .where('side = :side', { side: OrderSide.SELL })
        .where('status = :status', { status: OrderStatus.CREATED })
        .andWhere(`make->'assetType'->>'tokenId' = :tokenId`, {
          tokenId: order.make.assetType.tokenId,
        })
        .andWhere(`LOWER(make->'assetType'->>'contract') = :contract`, {
          contract: order.make.assetType.contract.toLowerCase(),
        })
        .getOne();

      if (existingOrder) {
        throw new MarketplaceException(constants.ORDER_ALREADY_EXISTS);
      }
    }

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
    // await this.staleOrdersWithHigherPrice(savedOrder);
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
    query.page = Number(query.page) || 1;
    query.limit = !Number(query.limit)
      ? constants.DEFAULT_LIMIT
      : Number(query.limit) <= constants.OFFSET_LIMIT
      ? Number(query.limit)
      : constants.OFFSET_LIMIT;

    const skippedItems = (query.page - 1) * query.limit;

    const queryBuilder = this.orderRepository.createQueryBuilder('order');
    queryBuilder.where('status = :status', { status: OrderStatus.CREATED });

    if (query.side) {
      const numberSide = Number(query.side);
      if (numberSide !== OrderSide.BUY && numberSide !== OrderSide.SELL) {
        throw new MarketplaceException(constants.INVALID_ORDER_SIDE);
      }
      queryBuilder.andWhere('side = :side', { side: numberSide });
    }

    const utcTimestamp = Utils.getUtcTimestamp();

    if (!!query.hasOffers) {
      // Get all buy orders
      const buyOffers = await this.orderRepository
        .createQueryBuilder('order')
        .where('status = :status', { status: OrderStatus.CREATED })
        .andWhere(`(order.end = 0 OR :end < order.end )`, {
          end: utcTimestamp,
        })
        .andWhere(`order.side = :side`, {
          side: OrderSide.BUY,
        })
        .getMany();

      let queryText = '';

      // Search for any sell orders that have offers
      buyOffers.forEach((offer) => {
        // Offers(buy orders) have the nft info in 'take'
        const tokenId = offer.take.assetType.tokenId;
        const contract = offer.take.assetType.contract;
        if (tokenId && contract) {
          queryText += `${queryText ? 'OR ' : '('}`;
          // Sell orders have the nft info in 'make'
          queryText += `(make->'assetType'->>'tokenId' = '${tokenId}' AND LOWER(make->'assetType'->>'contract') = '${contract.toLowerCase()}')`;
        }
      });

      // If query is empty --> there are no orders with offers
      if (!queryText) {
        return [];
      }
      queryBuilder.andWhere(queryText + ')');
    }

    if (query.maker) {
      queryBuilder.andWhere('maker = :maker', {
        maker: query.maker.toLowerCase(),
      });
    }

    if (query.assetClass) {
      const queryMake = `make->'assetType'->>'assetClass' IN (:...assetClass)`;
      const queryTake = `take->'assetType'->>'assetClass' IN (:...assetClass)`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}))`;
      queryBuilder.andWhere(queryForBoth, {
        assetClass: query.assetClass.replace(/\s/g, '').split(','),
      });
    }

    if (query.collection) {
      const queryMake = `make->'assetType'->'contract' = :collection`;
      const queryMakeBundle = `make->'assetType'->'contracts' ?| array[:collections]`;
      const queryTake = `take->'assetType'->'contract' = :collection`;
      const queryTakeBundle = `take->'assetType'->'contracts' ?| array[:collections]`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}) OR (${queryMakeBundle}) OR (${queryTakeBundle}))`;
      queryBuilder.andWhere(queryForBoth, {
        collection: `"${query.collection.toLowerCase()}"`,
        collections: `${query.collection.toLowerCase()}`,
      });
    }

    if (query.tokenIds) {
      // @TODO there is no filtering by tokenId for ERC721_BUNDLE orders supposedly because of array of arrays
      const queryMake = `make->'assetType'->>'tokenId' IN (:...tokenIds)`;
      const queryTake = `take->'assetType'->>'tokenId' IN (:...tokenIds)`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}))`;
      queryBuilder.andWhere(queryForBoth, {
        tokenIds: query.tokenIds.replace(/\s/g, '').split(','),
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
      let queryTake = '';

      if (query.token === constants.ZERO_ADDRESS) {
        queryTake = `take->'assetType'->>'assetClass' = 'ETH'`;
      } else {
        queryTake = `LOWER(take->'assetType'->>'contract') = :token`;
      }

      queryBuilder.andWhere(queryTake, {
        token: query.token.toLowerCase(),
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
          'case order.end when 0 then 2 else 1 end, order.end',
        );
        break;
      case SortOrderOptionsEnum.HighestPrice:
        queryBuilder
          .addSelect(this.addPriceSortQuery(OrderSide.SELL), 'usd_value')
          .orderBy('usd_value', 'DESC');
        break;
      case SortOrderOptionsEnum.LowestPrice:
        queryBuilder
          .addSelect(this.addPriceSortQuery(OrderSide.SELL), 'usd_value')
          .orderBy('usd_value', 'ASC');
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
    query.page = Number(query.page) || 1;
    query.limit = !Number(query.limit)
      ? constants.DEFAULT_LIMIT
      : Number(query.limit) <= constants.OFFSET_LIMIT
      ? Number(query.limit)
      : constants.OFFSET_LIMIT;

    const skippedItems = (query.page - 1) * query.limit;
    const utcTimestamp = Utils.getUtcTimestamp();

    const queryBuilder = this.orderRepository.createQueryBuilder('order');
    queryBuilder
      .where('status = :status', { status: OrderStatus.CREATED })
      .andWhere(`(order.start = 0 OR order.start < :start)`, {
        start: utcTimestamp,
      })
      .andWhere(`(order.end = 0 OR :end < order.end )`, {
        end: utcTimestamp,
      })
      .andWhere(`order.side = :side`, {
        side: OrderSide.SELL,
      });

    if (!!query.hasOffers) {
      // Get all buy orders
      const buyOffers = await this.orderRepository
        .createQueryBuilder('order')
        .where('status = :status', { status: OrderStatus.CREATED })
        .andWhere(`(order.end = 0 OR :end < order.end )`, {
          end: utcTimestamp,
        })
        .andWhere(`order.side = :side`, {
          side: OrderSide.BUY,
        })
        .getMany();

      let queryText = '';

      // Search for any sell orders that have offers
      buyOffers.forEach((offer) => {
        // Offers(buy orders) have the nft info in 'take'
        const tokenId = offer.take.assetType.tokenId;
        const contract = offer.take.assetType.contract;
        if (tokenId && contract) {
          queryText += `${queryText ? 'OR ' : '('}`;
          // Sell orders have the nft info in 'make'
          queryText += `(make->'assetType'->>'tokenId' = '${tokenId}' AND LOWER(make->'assetType'->>'contract') = '${contract.toLowerCase()}')`;
        }
      });

      // If query is empty --> there are no orders with offers
      if (!queryText) {
        return [];
      }
      queryBuilder.andWhere(queryText + ')');
    }

    if (query.maker) {
      queryBuilder.andWhere('maker = :maker', {
        maker: query.maker.toLowerCase(),
      });
    }

    if (query.assetClass) {
      const queryMake = `make->'assetType'->>'assetClass' IN (:...assetClass)`;
      queryBuilder.andWhere(queryMake, {
        assetClass: query.assetClass.replace(/\s/g, '').split(','),
      });
    }

    if (query.collection) {
      const queryMake = `make->'assetType'->'contract' = :collection`;
      const queryMakeBundle = `make->'assetType'->'contracts' ?| array[:collections]`;
      const queryTake = `take->'assetType'->'contract' = :collection`;
      const queryTakeBundle = `take->'assetType'->'contracts' ?| array[:collections]`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}) OR (${queryMakeBundle}) OR (${queryTakeBundle}))`;
      queryBuilder.andWhere(queryForBoth, {
        collection: `"${query.collection.toLowerCase()}"`,
        collections: `${query.collection.toLowerCase()}`,
      });
    }

    if (query.tokenIds) {
      // @TODO there is no filtering by tokenId for ERC721_BUNDLE orders supposedly because of array of arrays
      const queryMake = `make->'assetType'->>'tokenId' IN (:...tokenIds)`;
      const queryTake = `take->'assetType'->>'tokenId' IN (:...tokenIds)`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}))`;
      queryBuilder.andWhere(queryForBoth, {
        tokenIds: query.tokenIds.replace(/\s/g, '').split(','),
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
      let queryTake = '';

      if (query.token === constants.ZERO_ADDRESS) {
        queryTake = `take->'assetType'->>'assetClass' = 'ETH'`;
      } else {
        queryTake = `LOWER(take->'assetType'->>'contract') = :token`;
      }

      queryBuilder.andWhere(queryTake, {
        token: query.token.toLowerCase(),
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
          'case order.end when 0 then 2 else 1 end, order.end',
        );
        break;
      case SortOrderOptionsEnum.HighestPrice:
        queryBuilder
          .addSelect(this.addPriceSortQuery(OrderSide.SELL), 'usd_value')
          .orderBy('usd_value', 'DESC');
        break;
      case SortOrderOptionsEnum.LowestPrice:
        queryBuilder
          .addSelect(this.addPriceSortQuery(OrderSide.SELL), 'usd_value')
          .orderBy('usd_value', 'ASC');
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

  public addPriceSortQuery(orderSide: OrderSide) {
    let nftSide = '';
    switch (orderSide) {
      case OrderSide.BUY:
        nftSide = 'make';
        break;
      case OrderSide.SELL:
        nftSide = 'take';
    }

    return `(case 
      when ${nftSide}->'assetType'->>'assetClass' = 'ETH' 
      then CAST(${nftSide}->>'value' as DECIMAL) / POWER(10,${
      TOKEN_DECIMALS[TOKENS.ETH]
    }) * ${this.coingecko.tokenUsdValues[TOKENS.ETH]}

      when LOWER(${nftSide}->'assetType'->>'contract') = '${this.coingecko.tokenAddresses[
      TOKENS.DAI
    ].toLowerCase()}' 
      then CAST(${nftSide}->>'value' as DECIMAL) / POWER(10,${
      TOKEN_DECIMALS[TOKENS.DAI]
    }) * ${this.coingecko.tokenUsdValues[TOKENS.DAI]} 

      when LOWER(${nftSide}->'assetType'->>'contract') = '${this.coingecko.tokenAddresses[
      TOKENS.USDC
    ].toLowerCase()}' 
      then CAST(${nftSide}->>'value' as DECIMAL) / POWER(10,${
      TOKEN_DECIMALS[TOKENS.USDC]
    }) * ${this.coingecko.tokenUsdValues[TOKENS.USDC]} 

      when LOWER(${nftSide}->'assetType'->>'contract') = '${this.coingecko.tokenAddresses[
      TOKENS.WETH
    ].toLowerCase()}' 
      then CAST(${nftSide}->>'value' as DECIMAL) / POWER(10,${
      TOKEN_DECIMALS[TOKENS.WETH]
    }) * ${this.coingecko.tokenUsdValues[TOKENS.WETH]} 

      when LOWER(${nftSide}->'assetType'->>'contract') = '${this.coingecko.tokenAddresses[
      TOKENS.XYZ
    ].toLowerCase()}' 
      then CAST(${nftSide}->>'value' as DECIMAL) / POWER(10,${
      TOKEN_DECIMALS[TOKENS.XYZ]
    }) * ${this.coingecko.tokenUsdValues[TOKENS.XYZ]}
      
      end)`;
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

    const utcTimestamp = Utils.getUtcTimestamp();

    const [bestOffer, lastOffer] = await Promise.all([
      this.orderRepository
        .createQueryBuilder('order')
        .where(`take->'assetType'->>'tokenId' = :tokenId`, {
          tokenId: tokenId,
        })
        .andWhere(`LOWER(take->'assetType'->>'contract') = :contract`, {
          contract: contract.toLowerCase(),
        })
        .andWhere(`order.status = :status`, {
          status: OrderStatus.CREATED,
        })
        .andWhere(`order.side = :side`, { side: OrderSide.BUY })
        .andWhere(`order.end > :end`, { end: utcTimestamp })
        .addSelect(this.addPriceSortQuery(OrderSide.BUY), 'usd_value')
        .orderBy('usd_value', 'DESC')
        .getOne(),
      this.orderRepository
        .createQueryBuilder('order')
        .where(
          `(take->'assetType'->>'tokenId' = :tokenId AND LOWER(take->'assetType'->>'contract') = :contract)
          OR (make->'assetType'->>'tokenId' = :tokenId AND LOWER(make->'assetType'->>'contract') = :contract)`,
          {
            tokenId: tokenId,
            contract: contract.toLowerCase(),
          },
        )
        .andWhere('order.status = :status', {
          status: OrderStatus.FILLED,
        })
        .orderBy('order.updatedAt', 'DESC')
        .getOne(),
    ]);

    return {
      bestOffer,
      lastOffer,
    };
  }

  /**
   * Returns certain data points for a collection (contract).
   * @param collection NFT token collection address.
   * @returns {Promise<Object>}
   */
  public async getCollection(
    collection: string,
  ): Promise<Record<string, unknown>> {
    if (!constants.REGEX_ETHEREUM_ADDRESS.test(collection)) {
      throw new MarketplaceException(constants.INVALID_CONTRACT_ADDRESS);
    }

    const [floorPrice, volumeTraded] = await Promise.all([
      this.getCollectionFloorPrice(collection),
      this.getCollectionVolumeTraded(collection),
    ]);

    return {
      floorPrice: floorPrice,
      volumeTraded: volumeTraded,
    };
  }

  /**
   * used to find the order which
   * @param contract nft token address
   * @param tokenId nft token tokenId
   * @param maker wallet address who is transfer the token out
   * @returns order
   */
  public async queryOne(contract: string, tokenId: string, maker = '') {
    const queryBuilder = this.orderRepository.createQueryBuilder();
    queryBuilder.where('status = :status', { status: OrderStatus.CREATED });

    queryBuilder.andWhere('side = :side', { side: OrderSide.SELL });

    if (maker) {
      queryBuilder.andWhere('maker = :maker', { maker: maker.toLowerCase() });
    }

    const queryMake = `make->'assetType'->'contract' = :collection`;
    const queryMakeBundle = `make->'assetType'->'contracts' ?| array[:collections]`;
    const queryForBoth = `((${queryMake}) OR (${queryMakeBundle}))`;
    queryBuilder.andWhere(queryForBoth, {
      collection: `"${contract.toLowerCase()}"`,
      collections: `${contract.toLowerCase()}`,
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

  public async matchOrders(events: MatchOrder[]) {
    const value = {};
    for (const event of events) {
      try {
        const leftOrder = await this.orderRepository.findOne({
          hash: event.leftOrderHash,
        });

        if (leftOrder) {
          if (OrderStatus.CREATED == leftOrder.status) {
            this.logger.log(
              `The matched order has been found. Order left hash: ${event.leftOrderHash}`,
            );
            leftOrder.status = OrderStatus.FILLED;
            leftOrder.matchedTxHash = event.txHash;

            // Populate taker
            let orderMaker = '';
            if (leftOrder.make.assetType.tokenId) {
              orderMaker = leftOrder.maker;
            } else if (leftOrder.take.assetType.tokenId) {
              orderMaker = leftOrder.taker;
            }

            // The taker adress will always be the one who isn't the order maker
            if (event.leftMaker.toLowerCase() !== orderMaker) {
              leftOrder.taker = event.leftMaker;
            } else {
              leftOrder.taker = event.rightMaker;
            }
            await this.orderRepository.save(leftOrder);

            value[event.txHash] = 'success';
          } else if (OrderStatus.FILLED == leftOrder.status) {
            // this is added to provide idempotency!
            this.logger.log(
              `The matched order is already filled. Order left hash: ${event.leftOrderHash}`,
            );
            value[event.txHash] = 'success';
          } else {
            this.logger.log(
              `The matched order's status is already "${
                OrderStatus[leftOrder.status]
              }"`,
            );
            value[event.txHash] = 'not found';
          }

          try {
            //marking related orders as stale regardless of the status.
            await this.markRelatedOrdersAsStale(leftOrder);
          } catch (e) {
            this.logger.error(`Error marking related orders as stale ${e}`);
            value[event.txHash] =
              'error marking related orders as stale: ' + e.message;
          }
        } else {
          value[event.txHash] = 'not found or has wrong status';
          this.logger.error(
            `The matched order is not found in database. Order left hash: ${event.leftOrderHash}`,
          );
        }
      } catch (e) {
        value[event.txHash] = 'error: ' + e.message;
        this.logger.error(
          `Error marking order as filled. Event: ${JSON.stringify(event)}`,
        );
      }
    }

    return value;
  }

  public async fetchListingHistory(contract: string, tokenId: string) {
    const queryBuilder = this.orderRepository.createQueryBuilder('order');
    const queryMakeCollection = `make->'assetType'->>'contract' = :contract`;
    const queryTakeCollection = `take->'assetType'->>'contract' = :contract`;
    const collectionQuery = `((${queryMakeCollection}) OR (${queryTakeCollection}))`;
    queryBuilder.andWhere(collectionQuery, {
      contract,
    });

    const queryMakeTokenId = `make->'assetType'->>'tokenId' = :tokenId`;
    const queryTakeTokenId = `take->'assetType'->>'tokenId' = :tokenId`;
    const tokenIdQuery = `((${queryMakeTokenId}) OR (${queryTakeTokenId}))`;
    queryBuilder.andWhere(tokenIdQuery, {
      tokenId,
    });

    queryBuilder.orderBy('order.createdAt', 'DESC');

    const listingHistory = await queryBuilder.getManyAndCount();

    return listingHistory;
  }

  private async markRelatedOrdersAsStale(leftOrder: Order) {
    let orderNftInfo: Asset = null;
    let orderCreator = '';

    // Take nft info either from 'take' or 'make'.
    if (leftOrder.make.assetType.tokenId) {
      orderNftInfo = leftOrder.make;
      orderCreator = leftOrder.maker;
    } else if (leftOrder.take.assetType.tokenId) {
      orderNftInfo = leftOrder.take;
      orderCreator = leftOrder.taker;
    } else {
      throw new MarketplaceException(
        "Invalid left order. Doesn't contain nft info.",
      );
    }

    // // 1. Mark any buy offers as stale. They can't be executed anymore as the owner has changed
    // const buyQuery = this.orderRepository
    //   .createQueryBuilder('order')
    //   .where(`order.side = :side`, { side: OrderSide.BUY })
    //   .andWhere(`order.status = :status`, { status: OrderStatus.CREATED })
    //   .andWhere(`LOWER(order.taker) = :taker`, { taker: orderCreator })
    //   .andWhere(`take->'assetType'->>'tokenId' = :tokenId`, {
    //     tokenId: orderNftInfo.assetType.tokenId,
    //   });

    // 2. Mark any sell offers as stale. They can't be executed anymore as the owner has changed
    const sellQuery = this.orderRepository
      .createQueryBuilder('order')
      .where(`order.side = :side`, { side: OrderSide.SELL })
      .andWhere(`order.status = :status`, { status: OrderStatus.CREATED })
      .andWhere(`LOWER(order.maker) = :maker`, { maker: orderCreator })
      .andWhere(`make->'assetType'->>'tokenId' = :tokenId`, {
        tokenId: orderNftInfo.assetType.tokenId,
      });

    // ETH orders don't have contract
    if (orderNftInfo.assetType.contract) {
      // buyQuery.andWhere(`LOWER(take->'assetType'->>'contract') = :contract`, {
      //   contract: orderNftInfo.assetType.contract.toLowerCase(),
      // });

      sellQuery.andWhere(`LOWER(make->'assetType'->>'contract') = :contract`, {
        contract: orderNftInfo.assetType.contract.toLowerCase(),
      });
    }

    // const [buyOffers, sellOffers] = await Promise.all([
    //   buyQuery.getMany(),
    //   sellQuery.getMany(),
    // ]);

    const sellOffers = await sellQuery.getMany();

    // this.logger.log(
    //   `Found ${buyOffers.length} buy offers related to an order match`,
    // );

    // if (buyOffers.length) {
    //   buyOffers.forEach((offer) => {
    //     offer.status = OrderStatus.STALE;
    //   });
    //   await this.orderRepository.save(buyOffers);
    // }

    this.logger.log(
      `Found ${sellOffers.length} sell offers related to an order match`,
    );

    if (sellOffers.length) {
      sellOffers.forEach((offer) => {
        offer.status = OrderStatus.STALE;
      });
      await this.orderRepository.save(sellOffers);
    }
  }

  /**
   * Marks orders as Cancelled and sets cancelledTxHash.
   * This method is supposed to process the API call PUT /internal/orders/cancel
   * which is called by the Marketplace-Indexer.
   * @See https://github.com/UniverseXYZ/Marketplace-Indexer
   * @param event - event data from the Indexer.
   * @returns void
   */
  public async cancelOrders(events: CancelOrder[]) {
    const value = {};
    for (const event of events) {
      try {
        const queryResult = await this.orderRepository
          .createQueryBuilder()
          .update(Order)
          .set({
            status: OrderStatus.CANCELLED,
            cancelledTxHash: event.txHash,
          })
          .where(
            `hash = :hash AND 
            maker = :maker AND 
            status IN(:status1, :status2, :status3)
            `,
            {
              hash: event.leftOrderHash,
              maker: event.leftMaker,
              status1: OrderStatus.CREATED,
              status2: OrderStatus.STALE,
              status3: OrderStatus.CANCELLED, // this is added to provide idempotency!
            },
          )
          .execute();

        value[event.txHash] = queryResult.affected ? 'success' : 'not found';

        if (queryResult.affected) {
          this.logger.log(
            `The Canceled order has been found. Order left hash: ${event.leftOrderHash}`,
          );
        } else {
          this.logger.error(
            `The Cancelled order is not found in database. Request: ${JSON.stringify(
              event,
            )}`,
          );
        }
      } catch (e) {
        value[event.txHash] = 'error: ' + e.message;
        this.logger.error(
          `Error cancelling order. Event: ${JSON.stringify(event)}`,
        );
      }
    }

    return value;
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

  protected async checkSubscribe(order: Order) {
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
            LOWER(o.make->'assetType'->>'contract') = :contract AND
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
              contract:
                orderWithLowerPrice.make.assetType.contract.toLowerCase(),
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

  /**
   *
   * @param collection Nft token collection address
   * @returns {Promise<string>} string represantation of the floor price in wei.
   */
  private async getCollectionFloorPrice(collection: string): Promise<string> {
    const utcTimestamp = Utils.getUtcTimestamp();
    const lowestOrder = await this.orderRepository
      .createQueryBuilder('order')
      .where(`order.side = :side`, {
        side: OrderSide.SELL,
      })
      .andWhere(`order.status = :status`, { status: OrderStatus.CREATED })
      .andWhere(`(order.start = 0 OR order.start < :start)`, {
        start: utcTimestamp,
      })
      .andWhere(`(order.end = 0 OR :end < order.end )`, {
        end: utcTimestamp,
      })
      .andWhere(`LOWER(make->'assetType'->>'contract') = :contract`, {
        contract: collection.toLowerCase(),
      })
      .andWhere(`take->'assetType'->>'assetClass' = :assetClass`, {
        assetClass: AssetClass.ETH,
      })
      .addSelect("CAST(take->>'value' as DECIMAL)", 'value_decimal')
      .orderBy('value_decimal', 'ASC')
      .getOne();

    if (!lowestOrder) {
      return '';
    }

    return lowestOrder.take.value;
  }

  /**
   * Returns the sum of prices in wei from all filled orders for a collection.
   * i.e. Collection's traded volume.
   * @param collection - collection (contract) address
   * @returns {Promise<string>}
   */
  private async getCollectionVolumeTraded(collection: string): Promise<string> {
    let value = '0';

    const orders = await this.orderRepository
      .createQueryBuilder('o')
      .where(
        `
        o.status = :status AND
        o.side = :side AND 
        LOWER(o.make->'assetType'->>'contract') = :contract AND
        o.take->'assetType'->>'assetClass' = :assetClass
      `,
        {
          status: OrderStatus.FILLED,
          side: OrderSide.SELL,
          contract: collection.toLowerCase(),
          assetClass: AssetClass.ETH,
        },
      )
      .select(`SUM(CAST(o.take->>'value' as DECIMAL))`, 'volumeTraded')
      .getRawOne();
    if (orders.volumeTraded) {
      value = orders.volumeTraded;
    }

    return value;
  }
}
