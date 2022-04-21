import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import R from 'ramda';
import {
  encodeAssetClass,
  encodeAssetData,
  encodeOrderData,
  hashOrderKey,
} from '../../common/utils/order-encoder';
import { Repository } from 'typeorm';
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
import { Order as PostgresOrder } from './order.entity';
import {
  OrderSide,
  OrderStatus,
  NftTokens,
  AssetType,
  AssetClass,
  BundleType,
  Asset,
} from './order.types';
import { EthereumService } from '../ethereum/ethereum.service';
import { MarketplaceException } from '../../common/exceptions/MarketplaceException';
import { constants } from '../../common/constants';
import { Utils } from '../../common/utils';
import web3 from 'web3';
import { SortOrderOptionsEnum } from './order.sort';
import { CoingeckoService } from '../coingecko/coingecko.service';
import { TOKENS, TOKEN_DECIMALS } from '../coingecko/tokens';
import { Order, OrderDocument } from './schema/order.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class OrdersService {
  private watchdogUrl;
  private logger;

  constructor(
    private readonly config: AppConfig,
    private readonly httpService: HttpService,
    private readonly ethereumService: EthereumService,
    @InjectModel(Order.name)
    private readonly ordersModel: Model<OrderDocument>,
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
    const utcTimestamp = Utils.getUtcTimestamp();

    // Check if order for the nft already exists
    if (order.side === OrderSide.SELL) {
      const existingOrder = await this.ordersModel.findOne({
        side: OrderSide.SELL,
        status: OrderStatus.CREATED,
        make: {
          assetType: {
            tokenId: order.make.assetType.tokenId,
          },
          contract: order.make.assetType.contract.toLowerCase(),
        },
        $and: [
          {
            $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
          },
          { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
        ],
      });

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

    const savedOrder = await this.ordersModel.create(order);
    // await this.staleOrdersWithHigherPrice(savedOrder);
    this.checkSubscribe(savedOrder.maker);
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
    const order: Order = {
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
      side: 0,
      cancelledTxHash: '',
      matchedTxHash: null,
      hash: '',
    };

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
    const rightOrder = {
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
    };
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
    const order = await this.ordersModel.findOne({ hash });
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

    // const queryFilters = [{ status: OrderStatus.CREATED }] as any;
    const queryFilters = [
      {
        $or: [
          {
            status: OrderStatus.CREATED,
          },
          {
            status: OrderStatus.PARTIALFILLED,
          },
        ],
      },
    ] as any;

    if (query.side) {
      const numberSide = Number(query.side);
      if (numberSide !== OrderSide.BUY && numberSide !== OrderSide.SELL) {
        throw new MarketplaceException(constants.INVALID_ORDER_SIDE);
      }
      queryFilters.side = numberSide;
    }

    const utcTimestamp = Utils.getUtcTimestamp();

    if (!!query.hasOffers) {
      // Get all buy orders
      const buyOffers = await this.ordersModel.find({
        $and: [
          {
            status: OrderStatus.CREATED,
            side: OrderSide.BUY,
          },
          {
            $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
          },
          { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
        ],
      });

      const innerQuery = [];

      // Search for any sell orders that have offers
      buyOffers.forEach((offer) => {
        // Offers(buy orders) have the nft info in 'take'
        const tokenId = offer.take.assetType.tokenId;
        const contract = offer.take.assetType.contract;
        if (tokenId && contract) {
          innerQuery.push({
            make: {
              assetType: {
                tokenId: tokenId,
              },
              contract: contract.toLowerCase(),
            },
          });
        }
      });

      // If query is empty --> there are no orders with offers
      if (!innerQuery.length) {
        return [[], 0];
      }
      queryFilters['$and'] = innerQuery;
    }

    if (query.maker) {
      queryFilters.maker = query.maker.toLowerCase();
    }

    if (query.assetClass) {
      const assetClasses = query.assetClass.replace(/\s/g, '').split(',');
      queryFilters.push({
        $or: [
          {
            'make.assetType.assetClass': {
              $in: assetClasses,
            },
          },
          {
            'take.assetType.assetClass': {
              $in: assetClasses,
            },
          },
        ],
      });
    }

    if (query.collection) {
      const collections = query.collection
        .split(',')
        .map((c) => c.toLowerCase());

      queryFilters.push({
        $or: [
          {
            'make.assetType.contract': {
              $in: collections,
            },
          },
          {
            'take.assetType.contract': {
              $in: collections,
            },
          },
          {
            'make.assetType.contracts': {
              $in: collections,
            },
          },
          {
            'take.assetType.contracts': {
              $in: collections,
            },
          },
        ],
      });
    }

    if (query.tokenIds) {
      const tokenIds = query.tokenIds.replace(/\s/g, '').split(',');

      queryFilters.push({
        $or: [
          {
            'make.assetType.tokenId': {
              $in: tokenIds,
            },
          },
          {
            'take.assetType.tokenId': {
              $in: tokenIds,
            },
          },
          {
            'make.assetType.tokenIds': {
              $in: tokenIds,
            },
          },
          {
            'take.assetType.tokenIds': {
              $in: tokenIds,
            },
          },
        ],
      });
    }

    if (query.beforeTimestamp) {
      const milisecTimestamp = Number(query.beforeTimestamp) * 1000;
      const utcDate = new Date(milisecTimestamp);

      queryFilters.push({
        createdAt: { $gt: utcDate.toDateString() },
      });
    }

    if (query.token) {
      if (query.token === constants.ZERO_ADDRESS) {
        queryFilters.push({
          'take.assetType.assetClass': AssetClass.ETH,
        });
      } else {
        // REGEX SEARCH IS NOT PERFORMANT
        // DOCUMENTDB DOESNT SUPPORT COLLATION INDICES
        // query.token address MUST BE UPPERCASE CONTRACT ADDRESS
        queryFilters.push({
          'take.assetType.contract': query.token,
        });
      }
    }

    if (query.minPrice) {
      const weiPrice = web3.utils.toWei(query.minPrice);

      queryFilters.push({
        $expr: { $gte: [{ $toInt: '$take.value' }, parseFloat(weiPrice)] },
      });
    }

    if (query.maxPrice) {
      const weiPrice = web3.utils.toWei(query.maxPrice);

      queryFilters.push({
        $expr: { $lte: [{ $toInt: '$take.value' }, parseFloat(weiPrice)] },
      });
    }

    let sort = {} as any;
    let aggregation = [] as any;
    switch (Number(query.sortBy)) {
      case SortOrderOptionsEnum.EndingSoon:
        aggregation = this.addEndSortingAggregation();
        sort.orderSort = 1;
        break;
      case SortOrderOptionsEnum.HighestPrice:
        aggregation = this.addPriceSortingAggregation(OrderSide.SELL);
        sort.usd_value = -1;
        break;
      case SortOrderOptionsEnum.LowestPrice:
        aggregation = this.addPriceSortingAggregation(OrderSide.SELL);
        sort.usd_value = 1;
        break;
      case SortOrderOptionsEnum.RecentlyListed:
        sort.createdAt = -1;
        break;
      default:
        sort.createdAt = -1;
        break;
    }

    // _id is unique and will return consistent sorting
    // results because other sorting params are not unique
    sort = {
      ...sort,
      createdAt: -1,
      _id: -1,
    };

    if (aggregation.length) {
      aggregation = [
        ...aggregation,
        {
          $match: { $and: queryFilters },
        },
        {
          $sort: sort,
        },
        { $skip: skippedItems },
        { $limit: query.limit },
      ];

      const [items, count] = await Promise.all([
        this.ordersModel.aggregate(aggregation),
        this.ordersModel.countDocuments({ $and: queryFilters }),
      ]);

      return [items, count];
    }

    const [items, count] = await Promise.all([
      this.ordersModel
        .find({ $and: queryFilters })
        .sort({ ...sort })
        .skip(skippedItems)
        .limit(query.limit),
      this.ordersModel.countDocuments({ $and: queryFilters }),
    ]);

    return [items, count];
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

    const queryFilters = [
      {
        // status: OrderStatus.CREATED,
        side: OrderSide.SELL,
      },
      {
        $or: [
          {
            status: OrderStatus.CREATED,
          },
          {
            status: OrderStatus.PARTIALFILLED,
          },
        ],
      },
      {
        $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
      },
      { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
    ] as any;

    if (!!query.hasOffers) {
      // Get all buy orders
      const buyOffers = await this.ordersModel.find({
        $and: [
          {
            status: OrderStatus.CREATED,
            side: OrderSide.BUY,
          },
          {
            $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
          },
          { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
        ],
      });

      // const queryText = '';
      const innerQuery = [];

      // Search for any sell orders that have offers
      buyOffers.forEach((offer) => {
        // Offers(buy orders) have the nft info in 'take'
        const tokenId = offer.take.assetType.tokenId;
        const contract = offer.take.assetType.contract;
        if (tokenId && contract) {
          innerQuery.push({
            make: { assetType: { tokenId, contract } },
          });
        }
      });

      // If query is empty --> there are no orders with offers
      if (!innerQuery.length) {
        return [[], 0];
      }
      queryFilters.push({ $or: innerQuery });
    }

    if (query.maker) {
      queryFilters.push({ maker: query.maker.toLowerCase() });
    }

    if (query.assetClass) {
      const assetClasses = query.assetClass.replace(/\s/g, '').split(',');

      queryFilters.push({
        'make.assetType.assetClass': {
          $in: assetClasses,
        },
      });
    }

    if (query.collection) {
      const collections = query.collection
        .split(',')
        .map((c) => c.toLowerCase());

      queryFilters.push({
        $or: [
          {
            'make.assetType.contract': {
              $in: collections,
            },
          },
          {
            'take.assetType.contract': {
              $in: collections,
            },
          },
          {
            'make.assetType.contracts': {
              $in: collections,
            },
          },
          {
            'take.assetType.contracts': {
              $in: collections,
            },
          },
        ],
      });
    }

    if (query.tokenIds) {
      const tokenIds = query.tokenIds.replace(/\s/g, '').split(',');

      queryFilters.push({
        $or: [
          {
            'make.assetType.tokenId': {
              $in: tokenIds,
            },
          },
          {
            'take.assetType.tokenId': {
              $in: tokenIds,
            },
          },
          {
            'make.assetType.tokenIds': {
              $in: tokenIds,
            },
          },
          {
            'take.assetType.tokenIds': {
              $in: tokenIds,
            },
          },
        ],
      });
    }

    if (query.beforeTimestamp) {
      const milisecTimestamp = Number(query.beforeTimestamp) * 1000;
      const utcDate = new Date(milisecTimestamp);

      queryFilters.push({
        createdAt: { $gt: utcDate.toDateString() },
      });
    }

    if (query.token) {
      if (query.token === constants.ZERO_ADDRESS) {
        queryFilters.push({
          'take.assetType.assetClass': AssetClass.ETH,
        });
      } else {
        // REGEX SEARCH IS NOT PERFORMANT
        // DOCUMENTDB DOESNT SUPPORT COLLATION INDICES
        // query.token address MUST BE UPPERCASE CONTRACT ADDRESS
        queryFilters.push({
          'take.assetType.contract': query.token,
        });
      }
    }

    if (query.minPrice) {
      const weiPrice = web3.utils.toWei(query.minPrice);

      queryFilters.push({
        $expr: { $gte: [{ $toInt: '$take.value' }, parseFloat(weiPrice)] },
      });
    }

    if (query.maxPrice) {
      const weiPrice = web3.utils.toWei(query.maxPrice);

      queryFilters.push({
        $expr: { $lte: [{ $toInt: '$take.value' }, parseFloat(weiPrice)] },
      });
    }

    let sort = {} as any;
    let aggregation = [] as any;
    switch (Number(query.sortBy)) {
      case SortOrderOptionsEnum.EndingSoon:
        aggregation = this.addEndSortingAggregation();
        sort.orderSort = 1;
        break;
      case SortOrderOptionsEnum.HighestPrice:
        aggregation = this.addPriceSortingAggregation(OrderSide.SELL);
        sort.usd_value = -1;
        break;
      case SortOrderOptionsEnum.LowestPrice:
        aggregation = this.addPriceSortingAggregation(OrderSide.SELL);
        sort.usd_value = 1;
        break;
      case SortOrderOptionsEnum.RecentlyListed:
        sort.createdAt = -1;
        break;
      default:
        sort.createdAt = -1;
        break;
    }

    // _id is unique and will return consistent sorting
    // results because other sorting params are not unique
    sort = {
      ...sort,
      createdAt: -1,
      _id: -1,
    };

    if (aggregation.length) {
      aggregation = [
        ...aggregation,
        {
          $match: { $and: queryFilters },
        },
        {
          $sort: sort,
        },
        { $skip: skippedItems },
        { $limit: query.limit },
      ];

      const [items, count] = await Promise.all([
        this.ordersModel.aggregate(aggregation),
        this.ordersModel.countDocuments({ $and: queryFilters }),
      ]);

      return [items, count];
    }

    const [items, count] = await Promise.all([
      this.ordersModel
        .find({ $and: queryFilters })
        .sort({ ...sort })
        .skip(skippedItems)
        .limit(query.limit),
      this.ordersModel.countDocuments({ $and: queryFilters }),
    ]);

    return [items, count];
  }

  private addEndSortingAggregation() {
    // We want to show orders with offers in ascending order but also show offers without offers at the end
    return [
      {
        $addFields: {
          orderSort: {
            $switch: {
              branches: [
                {
                  case: {
                    $eq: ['$end', 0],
                  },
                  // Workaround which is safe to use until year 2255
                  then: Number.MAX_SAFE_INTEGER,
                },
              ],
              default: '$end',
            },
          },
        },
      },
    ];
  }

  private addPriceSortingAggregation(orderSide: OrderSide) {
    if (orderSide === OrderSide.BUY) {
      return [
        {
          $addFields: {
            usd_value: {
              $switch: {
                branches: [
                  {
                    case: {
                      $eq: ['$make.assetType.assetClass', AssetClass.ETH],
                    },
                    then: {
                      $divide: [
                        { $toDecimal: '$make.value' },
                        Math.pow(10, TOKEN_DECIMALS[TOKENS.ETH]) *
                          this.coingecko.tokenUsdValues[TOKENS.ETH],
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: [
                        '$make.assetType.contract',
                        this.coingecko.tokenAddresses[TOKENS.DAI],
                      ],
                    },
                    then: {
                      $divide: [
                        { $toDecimal: '$make.value' },
                        Math.pow(10, TOKEN_DECIMALS[TOKENS.DAI]) *
                          this.coingecko.tokenUsdValues[TOKENS.DAI],
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: [
                        '$make.assetType.contract',
                        this.coingecko.tokenAddresses[TOKENS.WETH],
                      ],
                    },
                    then: {
                      $divide: [
                        { $toDecimal: '$make.value' },
                        Math.pow(10, TOKEN_DECIMALS[TOKENS.WETH]) *
                          this.coingecko.tokenUsdValues[TOKENS.WETH],
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: [
                        '$make.assetType.contract',
                        this.coingecko.tokenAddresses[TOKENS.USDC],
                      ],
                    },
                    then: {
                      $divide: [
                        { $toDecimal: '$make.value' },
                        Math.pow(10, TOKEN_DECIMALS[TOKENS.USDC]) *
                          this.coingecko.tokenUsdValues[TOKENS.USDC],
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: [
                        '$make.assetType.contract',
                        this.coingecko.tokenAddresses[TOKENS.XYZ],
                      ],
                    },
                    then: {
                      $divide: [
                        { $toDecimal: '$make.value' },
                        Math.pow(10, TOKEN_DECIMALS[TOKENS.XYZ]) *
                          this.coingecko.tokenUsdValues[TOKENS.XYZ],
                      ],
                    },
                  },
                ],
                default: 0,
              },
            },
          },
        },
      ];
    } else {
      return [
        {
          $addFields: {
            usd_value: {
              $switch: {
                branches: [
                  {
                    case: {
                      $eq: ['$take.assetType.assetClass', AssetClass.ETH],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: [
                            { $toDecimal: '$take.value' },
                            { $pow: [10, TOKEN_DECIMALS[TOKENS.ETH]] },
                          ],
                        },
                        this.coingecko.tokenUsdValues[TOKENS.ETH],
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: [
                        '$take.assetType.contract',
                        this.coingecko.tokenAddresses[TOKENS.DAI],
                      ],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: [
                            { $toDecimal: '$take.value' },
                            { $pow: [10, TOKEN_DECIMALS[TOKENS.DAI]] },
                          ],
                        },
                        this.coingecko.tokenUsdValues[TOKENS.DAI],
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: [
                        '$take.assetType.contract',
                        this.coingecko.tokenAddresses[TOKENS.WETH],
                      ],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: [
                            { $toDecimal: '$take.value' },
                            { $pow: [10, TOKEN_DECIMALS[TOKENS.WETH]] },
                          ],
                        },
                        this.coingecko.tokenUsdValues[TOKENS.WETH],
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: [
                        '$take.assetType.contract',
                        this.coingecko.tokenAddresses[TOKENS.USDC],
                      ],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: [
                            { $toDecimal: '$take.value' },
                            { $pow: [10, TOKEN_DECIMALS[TOKENS.USDC]] },
                          ],
                        },
                        this.coingecko.tokenUsdValues[TOKENS.USDC],
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: [
                        '$take.assetType.contract',
                        this.coingecko.tokenAddresses[TOKENS.XYZ],
                      ],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: [
                            { $toDecimal: '$take.value' },
                            { $pow: [10, TOKEN_DECIMALS[TOKENS.XYZ]] },
                          ],
                        },
                        this.coingecko.tokenUsdValues[TOKENS.XYZ],
                      ],
                    },
                  },
                ],
                default: 0,
              },
            },
          },
        },
      ];
    }
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
      this.ordersModel.aggregate([
        ...this.addPriceSortingAggregation(OrderSide.SELL),
        {
          $match: {
            status: OrderStatus.CREATED,
            side: OrderSide.BUY,
            end: { $gt: utcTimestamp },
            'take.assetType.tokenId': tokenId,
            'take.assetType.contract': contract.toLowerCase(),
          },
        },
        {
          $sort: {
            usd_value: -1,
            createdAt: -1,
            _ud: -1,
          },
        },
        { $limit: 1 },
      ]),
      this.ordersModel
        .findOne({
          status: OrderStatus.FILLED,
          $or: [
            {
              'take.assetType.tokenId': tokenId,
              'make.assetType.contract': contract.toLowerCase(),
            },
            {
              'take.assetType.tokenId': tokenId,
              'make.assetType.contract': contract.toLowerCase(),
            },
          ],
        })
        .sort({ updatedAt: -1 }),
    ]);

    return {
      bestOffer: bestOffer[0] || null,
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
    const utcTimestamp = Utils.getUtcTimestamp();
    const queryFilters = [
      // { status: OrderStatus.CREATED },
      { side: OrderSide.SELL },
      {
        $or: [
          {
            status: OrderStatus.CREATED,
          },
          {
            status: OrderStatus.PARTIALFILLED,
          },
        ],
      },
      {
        $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
      },
      { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
    ] as any;

    if (maker) {
      queryFilters.push({ maker: maker.toLowerCase() });
    }

    queryFilters.push({
      $or: [
        { 'make.assetType.contract': contract.toLowerCase() },
        { 'make.assetType.contracts': contract.toLowerCase() },
      ],
    });

    const results = await this.ordersModel.find({ $and: queryFilters });
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
        const leftOrder = await this.ordersModel.findOne({
          hash: event.leftOrderHash,
        });

        if (leftOrder) {
          if (
            OrderStatus.CREATED == leftOrder.status ||
            OrderStatus.PARTIALFILLED == leftOrder.status ||
            // stale orders also need to be able to be marked as filled
            // because of the Watchdog.
            OrderStatus.STALE == leftOrder.status
          ) {
            this.logger.log(
              `The matched order has been found. Order left hash: ${event.leftOrderHash}`,
            );

            if (this.isPartialFill(leftOrder, event)) {
              leftOrder.status = OrderStatus.PARTIALFILLED;
              this.setPartialFill(leftOrder, event);
            } else {
              leftOrder.status = OrderStatus.FILLED;
              leftOrder.fill = '0';
            }

            // leftOrder.matchedTxHash = event.txHash;
            this.setMatchedTxHash(leftOrder, event);

            // Populate taker
            if (leftOrder.make.assetType.tokenId) {
              const orderMaker = leftOrder.maker;
              if (orderMaker.toLowerCase() === event.leftMaker.toLowerCase()) {
                leftOrder.taker = event.rightMaker.toLowerCase();
              } else {
                leftOrder.taker = event.leftMaker.toLowerCase();
              }
            } else if (leftOrder.take.assetType.tokenId) {
              const orderTaker = leftOrder.maker;
              if (orderTaker.toLowerCase() === event.leftMaker.toLowerCase()) {
                leftOrder.taker = event.rightMaker.toLowerCase();
              } else {
                leftOrder.taker = event.leftMaker.toLowerCase();
              }
            } else {
              throw new MarketplaceException(
                "Invalid left order. Doesn't contain nft info.",
              );
            }
            await this.ordersModel.updateOne({ _id: leftOrder._id }, leftOrder);
            this.checkUnsubscribe(leftOrder.maker);

            value[event.txHash] = 'success';
          } else if (OrderStatus.FILLED == leftOrder.status) {
            // this is added to provide idempotency!
            this.logger.log(
              `The matched order is already filled. Order left hash: ${event.leftOrderHash}`,
            );
            value[event.txHash] = 'success';
            this.checkUnsubscribe(leftOrder.maker);
          } else {
            this.logger.log(
              `The matched order's status is already "${
                OrderStatus[leftOrder.status]
              }"`,
            );
            value[event.txHash] = `error: order has status ${
              OrderStatus[leftOrder.status]
            }`;
          }

          try {
            //marking related orders as stale regardless of the status.
            await this.markRelatedOrdersAsStale(leftOrder as Order, event);
          } catch (e) {
            this.logger.error(`Error marking related orders as stale ${e}`);
            value[event.txHash] =
              'error marking related orders as stale: ' + e.message;
          }
        } else {
          value[event.txHash] = 'not found';
          this.logger.error(
            `The matched order is not found in database. Order left hash: ${event.leftOrderHash}`,
          );
        }
      } catch (e) {
        value[event.txHash] = 'error: ' + e.message;
        this.logger.error(
          `Error marking order as filled. Error: ${
            e.message
          }. Event: ${JSON.stringify(event)}`,
        );
      }
    }

    return value;
  }

  public async fetchListingHistory(contract: string, tokenId: string) {
    const queryFilters = [
      {
        $or: [
          {
            'make.assetType.contract': contract,
          },
          { 'take.assetType.contract': contract },
        ],
      },
      {
        $or: [
          {
            'make.assetType.tokenId': tokenId,
          },
          { 'take.assetType.tokenId': tokenId },
        ],
      },
    ] as any;

    const [listingHistory, count] = await Promise.all([
      this.ordersModel.find({ $and: queryFilters }).sort({ createdAt: -1 }),
      this.ordersModel.countDocuments({ $and: queryFilters }),
    ]);

    return [listingHistory, count];
  }

  private async markRelatedOrdersAsStale(leftOrder: Order, event: MatchOrder) {
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

    // 1. Mark any sell offers as stale. They can't be executed anymore as the owner has changed
    const queryFilters = [
      { hash: { $ne: leftOrder.hash } },
      { side: OrderSide.SELL },
      {
        $or: [
          {
            status: OrderStatus.CREATED,
          },
          {
            status: OrderStatus.PARTIALFILLED,
          },
        ],
      },
      { maker: orderCreator.toLowerCase() },
      { 'make.assetType.tokenId': orderNftInfo.assetType.tokenId },
    ] as any;

    // ETH orders don't have contract
    if (orderNftInfo.assetType.contract) {
      queryFilters.push({
        'make.assetType.contract':
          orderNftInfo.assetType.contract.toLowerCase(),
      });
    }

    const sellOffers = await this.ordersModel.find({ $and: queryFilters });

    this.logger.log(
      `Found ${sellOffers.length} sell offers related to an order match`,
    );

    if (sellOffers.length) {
      sellOffers.forEach((offer) => {
        if (
          AssetClass.ERC1155 === offer.make.assetType.assetClass &&
          //it's always event.newLeftFill as the matching event here is assumed to be
          //a match against a buy order (an offer).
          Number(offer.make.value) >
            Number(offer.fill) + Number(event.newLeftFill)
        ) {
          offer.status = OrderStatus.PARTIALFILLED;
          offer.fill = '' + (Number(offer.fill) + Number(event.newLeftFill));
        } else {
          offer.status = OrderStatus.STALE;
          this.checkUnsubscribe(offer.maker);
        }
      });
      await this.ordersModel.bulkSave(sellOffers);
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
        const queryResult = await this.ordersModel.updateOne(
          {
            hash: event.leftOrderHash,
            maker: event.leftMaker,
            status: {
              $in: [
                OrderStatus.CREATED,
                OrderStatus.STALE,
                OrderStatus.CANCELLED,
              ],
            },
          },
          {
            status: OrderStatus.CANCELLED,
            cancelledTxHash: event.txHash,
          },
        );

        value[event.txHash] = queryResult.acknowledged
          ? 'success'
          : 'not found';
        this.checkUnsubscribe(event.leftMaker);

        if (queryResult.acknowledged) {
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

  /**
   * Marks an order as stale.
   * This method is intented to be called by the /internal/orders/track endpoint.
   * @param event - event data from Alchemy.
   * @returns void
   */
  public async staleOrder(event: TrackOrderDto) {
    const { fromAddress, toAddress, address, erc721TokenId } = event;
    const matchedOne = await this.queryOne(address, erc721TokenId, fromAddress);
    if (!matchedOne) {
      this.logger.error(
        `Failed to find this order: contract: ${address}, tokenId: ${erc721TokenId}, from: ${fromAddress}, to: ${toAddress}`,
      );
      return;
    }
    if (OrderStatus.FILLED == matchedOne.status) {
      this.logger.log(
        `The order is already filled. Can't mark it as stale. Event: ${JSON.stringify(
          event,
        )}. Order: ${JSON.stringify(matchedOne)}`,
      );
      return;
    }

    this.logger.log(`Found matching order by alchemy: ${matchedOne.hash}`);
    await this.ordersModel.updateOne(
      { hash: matchedOne.hash },
      { status: OrderStatus.STALE },
    );
    this.checkUnsubscribe(matchedOne.maker);
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

    const count = await this.ordersModel.countDocuments({
      maker: walletAddress.toLowerCase(),
    });
    value = value + count;

    return value;
  }

  /**
   * This method checks if the passed wallet address has any active listings and,
   * if not, makes a request to the Watchdog to unsubscribe this wallet from the
   * list of monitored wallets.
   * The Watchdog in its turn makes a request to alchemy to remove this wallet
   * from the "webhook" and marks this address as CANCELLED in its table ("subscription" table).
   * I.E. a wallet, once added to the Watchdog table, does not get removed.
   * @param walletAddress - order.maker
   * @returns void
   */
  public async checkUnsubscribe(walletAddress: string) {
    walletAddress = walletAddress.toLowerCase();

    // if we are still interested in this address, don't unsubscribe
    const pendingOrders = await this.ordersModel
      .find({
        maker: walletAddress,
        status: { $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED] },
      })
      .limit(2);

    if (pendingOrders.length === 0) {
      this.httpService
        .post(`${this.watchdogUrl}/unsubscribe/`, {
          addresses: [walletAddress],
          topic: 'NFT',
        })
        .subscribe({
          next: (v) => this.logger.log(v.data),
          error: (e) => this.logger.error(e),
          complete: () => this.logger.log('complete'),
        });
    }
  }

  protected async checkSubscribe(maker: string) {
    // if it is already subscribed, that's ok.
    this.httpService
      .post(`${this.watchdogUrl}/v1/subscribe`, {
        addresses: [maker],
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
  private async staleOrdersWithHigherPrice(orderWithLowerPrice: OrderDocument) {
    if (OrderSide.SELL === orderWithLowerPrice.side) {
      let ordersWithHigherPrice = [];

      if (
        AssetClass.ERC721 === orderWithLowerPrice.make.assetType.assetClass ||
        AssetClass.ERC1155 === orderWithLowerPrice.make.assetType.assetClass
      ) {
        ordersWithHigherPrice = await this.ordersModel.find({
          _id: { $not: orderWithLowerPrice._id },
          status: OrderStatus.CREATED,
          side: OrderSide.SELL,
          contract: orderWithLowerPrice.make.assetType.contract.toLowerCase(),
          'make.assetType.assetClass': {
            $in: [AssetClass.ERC721, AssetClass.ERC1155],
          },
          'make.assetType.tokenId': orderWithLowerPrice.make.assetType.tokenId,
          //TODO: Fix this when we migrate to mongodb
          'take.value': { $gt: orderWithLowerPrice.take.value },
        });
      } else if (
        AssetClass.ERC721_BUNDLE ===
        orderWithLowerPrice.make.assetType.assetClass
      ) {
        // @TODO Add support for ERC721_BUNDLE
      }

      for (const orderWithHigherPrice of ordersWithHigherPrice) {
        orderWithHigherPrice.status = OrderStatus.STALE;
      }
      await this.ordersModel.bulkSave(ordersWithHigherPrice);
    }
  }

  /**
   *
   * @param collection Nft token collection address
   * @returns {Promise<string>} string represantation of the floor price in wei.
   */
  private async getCollectionFloorPrice(collection: string): Promise<string> {
    const utcTimestamp = Utils.getUtcTimestamp();

    const lowestOrder = await this.ordersModel
      .findOne({
        $and: [
          {
            status: OrderStatus.CREATED,
            side: OrderSide.SELL,
            'make.assetType.contract': collection.toLowerCase(),
            'take.assetType.assetClass': AssetClass.ETH,
          },
          {
            $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
          },
          { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
        ],
      })
      .sort({ 'take.value': 1 });

    // We need collation support in order to sort numberic strings properly
    // https://stackoverflow.com/questions/16126437/how-to-make-a-mongodb-query-sort-on-strings-with-number-postfix
    // .collation({ locale: 'en_US', numericOrdering: true });

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

    //TODO: Finish this when we have real mongo db
    // $toDecimal isn't supported
    const orders = await this.ordersModel
      .aggregate([
        {
          $addFields: {
            numericValue: { $toDecimal: '$take.value' },
          },
        },
        {
          $match: {
            status: OrderStatus.FILLED,
            side: OrderSide.SELL,
            contract: collection.toLowerCase(),
            'make.assetType.assetClass': AssetClass.ETH,
            'make.assetType.contract': collection.toLowerCase(),
          },
        },
        {
          $group: {
            _id: null,
            sum: { $sum: '$take.value' },
          },
        },
      ])
      .exec();

    if (orders) {
      value = orders[0].numericValue;
    }

    return value;
  }

  /**
   * This method returns whether or not the match event data indicates
   * that the order is being partially filled.
   * The order has to be a sell or buy order with assetClass = AssetClass.ERC1155.
   * @param order
   * @param event
   * @returns {Boolean}
   */
  private isPartialFill(order: Order, event: MatchOrder) {
    let value = false;

    let originalValue = 0;
    const alreadyFilled = parseInt(order.fill);

    //if this is the original listing (SELL order)
    if (
      OrderSide.SELL === order.side &&
      AssetClass.ERC1155 === order.make.assetType.assetClass
    ) {
      originalValue = parseInt(order.make.value);
      if (originalValue > alreadyFilled + parseInt(event.newRightFill)) {
        value = true;
      }
    } else if (
      //if this is an offer (BUY order)
      OrderSide.BUY === order.side &&
      AssetClass.ERC1155 === order.take.assetType.assetClass
    ) {
      originalValue = parseInt(order.take.value);
      if (originalValue > alreadyFilled + parseInt(event.newLeftFill)) {
        value = true;
      }
    }

    return value;
  }

  /**
   * This method sets the matchedTxHash property on the order object.
   * If the order is a ERC1155 order, matchedTxHash becomes an array
   * of objects. Each objects has tx hash as the key and the amount of
   * 1155 editions in the match event as the value.
   * If the orderis not ERC1155, matchedTxHash is still an array with
   * only 1 object with value = '1'.
   * @param order
   * @param event
   * @returns void
   */
  private setMatchedTxHash(order: Order, event: MatchOrder) {
    if (
      AssetClass.ERC1155 === order.make.assetType.assetClass ||
      AssetClass.ERC1155 === order.take.assetType.assetClass
    ) {
      let matchedHashes = order.matchedTxHash;
      if (Array.isArray(matchedHashes)) {
        // adding only unique tx hashes
        const existingHashes = matchedHashes.map((entry) => {
          return Object.keys(entry)[0];
        });
        if (!existingHashes.includes(event.txHash)) {
          matchedHashes.push({
            [event.txHash]:
              OrderSide.SELL === order.side
                ? event.newRightFill
                : event.newLeftFill,
          });
        }
      } else {
        matchedHashes = [
          {
            [event.txHash]:
              OrderSide.SELL === order.side
                ? event.newRightFill
                : event.newLeftFill,
          },
        ];
      }

      order.matchedTxHash = matchedHashes;
    } else {
      order.matchedTxHash = [
        {
          [event.txHash]: '1',
        },
      ];
    }
  }

  /**
   * This method set the fill property on the order object if the order is a ERC1155 order.
   * It calculates the fill value from previous matches and adds the new event's fill
   * to that value.
   * "Fill" is the amount of 1155 editions that have been filled (bought) in an order.
   * @param order
   * @param event
   * @returns void
   */
  private setPartialFill(order: Order, event: MatchOrder) {
    if (
      AssetClass.ERC1155 === order.make.assetType.assetClass ||
      AssetClass.ERC1155 === order.take.assetType.assetClass
    ) {
      let fill = Number(order.fill);
      const matchedHashes = order.matchedTxHash;

      /**
       * This logic can be done in 2 ways:
       * 1. summing up all fills from the order.matchedTxHash property and adding the event's newRightFill (or newLeftFill).
       * 2. taking the order.fill property and adding the event's newRightFill (or newLeftFill) to it.
       * I'm doing it the latter way because there's a case when a listing gets
       * partially filled by accepting an offer (buy order).
       * In this case the buy order has a transaction and the initial listing has nothing.
       * However the fill property of the initial listing gets updated inside markRelatedOrdersAsStale()
       * so had i chosen the #1 option, this function would drop that fill value of a listing.
       */

      if (Array.isArray(matchedHashes)) {
        const existingHashes = matchedHashes.map((entry) => {
          // fill += Number(Object.values(entry)[0]);
          return Object.keys(entry)[0];
        });
        if (!existingHashes.includes(event.txHash)) {
          fill +=
            OrderSide.SELL === order.side
              ? Number(event.newRightFill)
              : Number(event.newLeftFill);
        }
      } else {
        fill +=
          OrderSide.SELL === order.side
            ? Number(event.newRightFill)
            : Number(event.newLeftFill);
      }

      order.fill = '' + fill;
    }
  }
}
