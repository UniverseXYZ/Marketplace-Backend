import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  CancelOrder,
  CreateOrderDto,
  QueryDto,
} from 'src/modules/orders/order.dto';
import { Order, OrderDocument } from '../orders/schema/order.schema';
import { Model } from 'mongoose';
import { IDataLayerService } from './interfaces/IDataLayerInterface';
import {
  Asset,
  AssetClass,
  AssetType,
  OrderSide,
  OrderStatus,
} from 'src/modules/orders/order.types';
import * as mongodb from 'mongodb';
import { constants } from 'src/common/constants';
import web3 from 'web3';
import { SortOrderOptionsEnum } from '../orders/order.sort';
import { Utils } from 'src/common/utils';

@Injectable()
export class DataLayerService implements IDataLayerService {
  private logger;

  constructor(
    @InjectModel(Order.name)
    private readonly ordersModel: Model<OrderDocument>,
  ) {
    this.logger = new Logger(DataLayerService.name);
  }

  public async createOrder(order: CreateOrderDto) {
    this.logger.log('Persisting new order in the database');

    const newOrder = await this.ordersModel.create(order);

    return newOrder;
  }

  public async findExistingOrder(
    tokenId: string,
    contract: string,
    utcTimestamp: number,
  ) {
    return await this.ordersModel.findOne({
      side: OrderSide.SELL,
      status: { $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED] },
      make: {
        assetType: {
          tokenId: tokenId,
          contract: contract.toLowerCase(),
        },
      },
      $and: [{ $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] }],
    });
  }

  /**
   * Returns whether or not a ERC721_BUNDLE order (defined by tokenIds & contracts) contains
   * an NFT that is currently listed.
   * @param tokenIds - array of arrays of tokenIds
   * @param contracts
   * @param utcTimestamp
   * @returns {Promise<boolean>}
   */
  public async bundleContainsListedNft(
    tokenIds: Array<any>,
    contracts: Array<any>,
    utcTimestamp: number,
  ): Promise<boolean> {
    let value = false;

    const existingOrders = await this.ordersModel.find({
      $and: [
        { side: OrderSide.SELL },
        { status: OrderStatus.CREATED },
        {
          $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }],
        },
        {
          $or: [
            {
              'make.assetType.contracts': {
                $in: contracts.map((contract) => {
                  return contract.toLowerCase();
                }),
              },
            },
            {
              'make.assetType.contract': {
                $in: contracts.map((contract) => {
                  return contract.toLowerCase();
                }),
              },
            },
          ],
        },
      ],
    });

    // let's do for instead of forEach() to save a couple of executions.
    for (let i = 0; i < existingOrders.length; i++) {
      const existingOrder = existingOrders[i];
      // if existingOrder is an AssetClass.ERC721_BUNDLE order
      if (AssetClass.ERC721_BUNDLE == existingOrder.make.assetType.assetClass) {
        for (
          let j = 0;
          j < existingOrder.make.assetType.contracts.length;
          j++
        ) {
          try {
            const contractIndex = contracts.indexOf(
              existingOrder.make.assetType.contracts[j],
            );
            if (
              -1 !== contractIndex &&
              Utils.getArraysIntersection(
                tokenIds[contractIndex],
                existingOrder.make.assetType.tokenIds[j],
              ).length
            ) {
              value = true;
              break;
            }
          } catch (e) {
            this.logger.warn(
              `${AssetClass.ERC721_BUNDLE} order with hash ${existingOrder.hash} likely has incorrect structure.`,
            );
            this.logger.warn(e);
          }
        }
      } else {
        const contractIndex = contracts.indexOf(
          existingOrder.make.assetType.contract,
        );
        if (
          -1 !== contractIndex &&
          tokenIds[contractIndex].includes(existingOrder.make.assetType.tokenId)
        ) {
          value = true;
          break;
        }
      }

      if (value) {
        break; // single return statement policy yeah ;)
      }
    }

    return value;
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
  public async getOrderByHash(hash: string) {
    const order = await this.ordersModel.findOne({ hash });
    return order;
  }

  public async getBuyOrdersBefore(utcTimestamp: number) {
    return await this.ordersModel.find({
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
  }

  public async getBestAndLastOffer(
    utcTimestamp: number,
    tokenId: string,
    contract: string,
    prices: number[],
    addresses: string[],
    decimals: number[],
  ) {
    const priceAggregation = this.buildPriceAggregation(
      prices,
      addresses,
      decimals,
      OrderSide.SELL,
    );

    return await Promise.all([
      this.ordersModel.aggregate([
        ...priceAggregation,
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
  }

  public async getOrderListingHistoryAndCount(
    contract: string,
    tokenId: string,
  ) {
    const queryFilters = {
      $and: [
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
      ],
    } as any;

    const [listingHistory, count] = await Promise.all([
      this.ordersModel.find(queryFilters).sort({ createdAt: -1 }),
      this.ordersModel.countDocuments(queryFilters),
    ]);

    return [listingHistory, count];
  }

  public async queryOrders(
    utcTimestamp: number,
    maker: string,
    contract: string,
  ) {
    const queryFilters = [
      { status: OrderStatus.CREATED },
      { side: OrderSide.SELL },
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

    return results;
  }

  public async updateById(newOrder: any): Promise<any> {
    return await this.ordersModel.updateOne({ _id: newOrder._id }, newOrder);
  }

  public async staleOrders(orders: any) {
    await this.ordersModel.bulkWrite(
      orders.map((order) => {
        return {
          updateOne: {
            filter: { hash: order.hash },
            update: {
              status: OrderStatus.STALE,
            },
          },
        };
      }),
    );
  }

  public async updateMany(newOrders: any): Promise<any> {
    return await await this.ordersModel.bulkSave(newOrders);
  }

  public async cancelOrder(event: CancelOrder): Promise<any> {
    return await this.ordersModel.updateOne(
      {
        hash: event.leftOrderHash,
        maker: event.leftMaker,
        status: {
          $in: [OrderStatus.CREATED, OrderStatus.STALE, OrderStatus.CANCELLED],
        },
      },
      {
        status: OrderStatus.CANCELLED,
        cancelledTxHash: event.txHash,
      },
    );
  }

  public async fetchPendingOrders(walletAddress: string) {
    const pendingOrders = await this.ordersModel
      .find({
        maker: walletAddress.toLowerCase(),
        status: { $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED] },
      })
      .limit(2);

    return pendingOrders;
  }

  async queryStaleOrders(
    orderNftInfo: Asset,
    orderTaker: string,
  ): Promise<Array<Order>> {
    // 1. Mark any sell offers as stale. They can't be executed anymore as the owner has changed

    const value = [];
    let ordersToStale = [];
    let queryFilters = {} as any;

    if (orderNftInfo.assetType.tokenIds) {
      // if the matched order is a AssetClass.ERC721_BUNDLE, then we only filter
      // sell bundles because a sell non-bundle order cannot be related to
      // a matched bundle!
      // In other words: a matched bundle order can only be an executed listing, or it can
      // be an executed bundle offer to a bundle listing. This function only needs to return
      // OrderSide.SELL orders that are related to executed offers.
      // That means if the matched (executed) order is a bundle, then its related OrderSide.SELL
      // listing (if any) is also a bundle.
      queryFilters = {
        $and: [
          { side: OrderSide.SELL },
          { status: OrderStatus.CREATED },
          { taker: orderTaker.toLowerCase() },
          { 'make.assetType.assetClass': AssetClass.ERC721_BUNDLE },
          {
            'make.assetType.contracts': {
              $in: orderNftInfo.assetType.contracts.map((contract) => {
                return contract.toLowerCase();
              }),
            },
          },
        ],
      };

      ordersToStale = await this.ordersModel.find(queryFilters);
      ordersToStale.forEach((order) => {
        // if the related sell order is an AssetClass.ERC721_BUNDLE order, then the only case
        // when a sell bundle order is related to a matched bundle order is when the matched order is
        // an offer to this sell order.
        // We'd need to go through all contracts and all tokenIds to understand if this sell bundle
        // order is the initial sell, but it's enough if at least 1 NFT from the matched order is listed
        // in the sell order to mark this sell order as stale.
        for (let i = 0; i < order.make.assetType.contracts.length; i++) {
          const contract = order.make.assetType.contracts[i];
          const matchedOrderContractIndex =
            orderNftInfo.assetType.contracts.indexOf(contract);
          if (
            -1 !== matchedOrderContractIndex &&
            Utils.getArraysIntersection(
              order.make.assetType.tokenIds[i],
              orderNftInfo.assetType.tokenIds[matchedOrderContractIndex],
            ).length
          ) {
            value.push(order);
            break;
          }
        }
      });
    } else {
      // if the matched order is not a bundle

      queryFilters = {
        $and: [
          { side: OrderSide.SELL },
          { status: OrderStatus.CREATED },
          { taker: orderTaker.toLowerCase() },
          {
            $or: [
              {
                'make.assetType.contract':
                  orderNftInfo.assetType.contract.toLowerCase(),
                'make.assetType.tokenId': orderNftInfo.assetType.tokenId,
              },
              {
                'make.assetType.contracts':
                  orderNftInfo.assetType.contract.toLowerCase(),
              },
            ],
          },
        ],
      };

      ordersToStale = await this.ordersModel.find(queryFilters);
      ordersToStale.forEach((order) => {
        // if it's an AssetClass.ERC721_BUNDLE order
        if (AssetClass.ERC721_BUNDLE == order.make.assetType.assetClass) {
          const contractIndex = order.make.assetType.contracts.indexOf(
            orderNftInfo.assetType.contract.toLowerCase(),
          );
          if (
            -1 !== contractIndex &&
            order.make.assetType.tokenIds[contractIndex].includes(
              orderNftInfo.assetType.tokenId,
            )
          ) {
            value.push(order);
          }
        } else {
          value.push(order);
        }
      });
    }

    return value;
  }

  /**
   * Returns array of orders to be marked as stale.
   * Technically there should be no more than 1 order to be marked as stale,
   * but just in case we're querying an array.
   * @param tokenId
   * @param contract
   * @param maker
   * @param utcTimestamp
   * @returns {Order[]} array of orders.
   */
  async queryOrdersForStale(
    tokenId: string,
    contract: string,
    maker: string,
    utcTimestamp: number,
  ): Promise<Array<Order>> {
    const value = [];
    const orders = await this.ordersModel.find({
      $and: [
        {
          status: OrderStatus.CREATED,
          side: OrderSide.SELL,
          maker: maker,
        },
        {
          $or: [
            {
              'make.assetType.contract': contract.toLowerCase(),
              'make.assetType.tokenId': tokenId,
            },
            {
              'make.assetType.contracts': contract.toLowerCase(),
            },
          ],
        },
        {
          $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }],
        },
      ],
    });

    orders.forEach((order) => {
      // if it's an AssetClass.ERC721_BUNDLE order
      if (AssetClass.ERC721_BUNDLE == order.make.assetType.assetClass) {
        const contractIndex = order.make.assetType.contracts.indexOf(
          contract.toLowerCase(),
        );
        if (
          -1 !== contractIndex &&
          order.make.assetType.tokenIds[contractIndex].includes(tokenId)
        ) {
          value.push(order);
        }
      } else {
        value.push(order);
      }
    });

    return value;
  }

  async fetchOrdersWithHigherPrice(orderWithLowerPrice: OrderDocument) {
    const orders = await this.ordersModel.find({
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
    return orders;
  }

  async fetchLowestOrder(collection: string, utcTimestamp: number) {
    // We need collation support in order to sort numberic strings properly
    // https://stackoverflow.com/questions/16126437/how-to-make-a-mongodb-query-sort-on-strings-with-number-postfix
    // .collation({ locale: 'en_US', numericOrdering: true });

    //TODO:: Check if price sorting is implemented correctly
    // Cast take.value to decimal and sort

    return await this.ordersModel
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
  }

  async fetchVolumeTraded(collection: string) {
    const orders = await this.ordersModel.aggregate([
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
    ]);

    let value = '0';

    if (orders && orders.length) {
      value = orders[0].numericValue;
    }

    return value;
  }

  buildPriceAggregation(
    prices: number[],
    tokenAdresses: string[],
    decimals: number[],
    orderSide: OrderSide,
  ) {
    const [ethPrice, usdcPrice, xyzPrice, daiPrice, wethPrice] = prices;
    const [ethAddress, usdcAddress, xyzAddress, daiAddress, wethAddress] =
      tokenAdresses;
    const [ethDecimals, usdcDecimals, xyzDecimals, daiDecimals, wethDecimals] =
      decimals;

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
                        Math.pow(10, ethDecimals) * ethPrice,
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: ['$make.assetType.contract', daiAddress],
                    },
                    then: {
                      $divide: [
                        { $toDecimal: '$make.value' },
                        Math.pow(10, daiDecimals) * daiPrice,
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: ['$make.assetType.contract', wethAddress],
                    },
                    then: {
                      $divide: [
                        { $toDecimal: '$make.value' },
                        Math.pow(10, wethDecimals) * wethPrice,
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: ['$make.assetType.contract', usdcAddress],
                    },
                    then: {
                      $divide: [
                        { $toDecimal: '$make.value' },
                        Math.pow(10, usdcDecimals) * usdcPrice,
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: ['$make.assetType.contract', xyzAddress],
                    },
                    then: {
                      $divide: [
                        { $toDecimal: '$make.value' },
                        Math.pow(10, xyzDecimals) * xyzPrice,
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
                            { $pow: [10, ethDecimals] },
                          ],
                        },
                        ethPrice,
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: ['$take.assetType.contract', daiAddress],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: [
                            { $toDecimal: '$take.value' },
                            { $pow: [10, daiDecimals] },
                          ],
                        },
                        daiPrice,
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: ['$take.assetType.contract', wethAddress],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: [
                            { $toDecimal: '$take.value' },
                            { $pow: [10, wethDecimals] },
                          ],
                        },
                        wethPrice,
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: ['$take.assetType.contract', usdcAddress],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: [
                            { $toDecimal: '$take.value' },
                            { $pow: [10, usdcDecimals] },
                          ],
                        },
                        usdcPrice,
                      ],
                    },
                  },
                  {
                    case: {
                      $eq: ['$take.assetType.contract', xyzAddress],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: [
                            { $toDecimal: '$take.value' },
                            { $pow: [10, xyzDecimals] },
                          ],
                        },
                        xyzPrice,
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

  async queryAll(
    query: QueryDto,
    utcTimestamp: number,
    skippedItems: number,
    prices: number[],
    tokenAdresses: string[],
    decimals: number[],
  ) {
    let queryFilters = [] as any;

    switch (query.side) {
      case (OrderSide.SELL, OrderSide.BUY):
        queryFilters = [
          {
            status: OrderStatus.CREATED,
            side: query.side,
          },
          {
            $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
          },
          { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
        ];
        break;
      default:
        queryFilters = [{ status: OrderStatus.CREATED }] as any;
        break;
    }

    if (query.side) {
      queryFilters.push({ side: Number(query.side) });
    }

    if (!!query.hasOffers) {
      // Get all buy orders
      const buyOffers = await this.getBuyOrdersBefore(utcTimestamp);

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
      queryFilters.push({ maker: query.maker.toLowerCase() });
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
        aggregation = sort.usd_value = -1;
        break;
      case SortOrderOptionsEnum.LowestPrice:
        aggregation = this.buildPriceAggregation(
          prices,
          tokenAdresses,
          decimals,
          OrderSide.SELL,
        );
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
      const finalAggregation = [
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
        this.ordersModel.aggregate(finalAggregation),
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

  addEndSortingAggregation() {
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

  /**
   * Returns an active SELL ERC721_BUNDLE order by the bundle data and
   * SELL order maker.
   * Returns null if not found.
   * @param bundle
   * @param maker - SELL ERC721_BUNDLE order maker.
   * @returns {Promise<Order|null>}
   */
  public async getSellOrderByBundleAndMaker(bundle: Asset, maker: string): Promise<Order|null> {
    let value: Order = null;

    const utcTimestamp = Utils.getUtcTimestamp();
    const sellBundleOrders = await this.ordersModel.find({
      $and: [
        { side: OrderSide.SELL },
        { status: OrderStatus.CREATED },
        { maker: maker },
        { 'make.value': bundle.value },
        {
          $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
        },
        { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
        {
          'make.assetType.contracts': {
            $all: bundle.assetType.contracts,
          },
        },
      ],
    });
    for (let i = 0; i < sellBundleOrders.length; i++) {
      const sellBundleOrder = sellBundleOrders[i];
      if (
        sellBundleOrder.make.value === bundle.value &&
        sellBundleOrder.make.assetType.contracts.length ===
          bundle.assetType.contracts.length
      ) {
        for (
          let j = 0;
          j < sellBundleOrder.make.assetType.contracts.length;
          j++
        ) {
          const contract = sellBundleOrder.make.assetType.contracts[j];
          const contractIndex = bundle.assetType.contracts.indexOf(contract);
          if (
            -1 == contractIndex ||
            sellBundleOrder.make.assetType.tokenIds[j].length !=
              Utils.getArraysIntersection(
                sellBundleOrder.make.assetType.tokenIds[j],
                bundle.assetType.tokenIds[contractIndex],
              ).length
          ) {
            break;
          }

          if (j === sellBundleOrder.make.assetType.contracts.length - 1) {
            // bingo if reached this line!
            value = sellBundleOrder;
          }
        }
      }

      if (value) {
        break;
      }
    }

    return value;
  }
}
