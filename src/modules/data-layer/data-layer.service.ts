import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  CancelOrder,
  CreateOrderDto,
  QueryDto,
} from 'src/modules/orders/order.dto';
// import { Order } from 'src/modules/orders/order.entity';
import { Order, OrderDocument } from '../orders/schema/order.schema';
import { Model, PipelineStage } from 'mongoose';
import { IDataLayerService } from './interfaces/IDataLayerInterface';
import {
  Asset,
  AssetClass,
  OrderActivity,
  OrderSide,
  OrderStatus,
} from 'src/modules/orders/order.types';
import * as mongodb from 'mongodb';
import { constants } from '../../common/constants';
import web3 from 'web3';
import { ethers } from 'ethers';
import { SortOrderOptionsEnum } from '../orders/order.sort';
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

  /**
   * Returns array of active SELL orders for spcified contract and token id.
   * It does return an array because ERC1155 NFTs may be listed multiple times
   * by different makers.
   * @param tokenId
   * @param contract
   * @param utcTimestamp
   * @returns {Promise<Array>}
   */
  public async findExistingOrders(
    tokenId: string,
    contract: string,
    utcTimestamp: number,
  ) {
    return await this.ordersModel.find({
      side: OrderSide.SELL,
      status: { $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED] },
      'make.assetType.tokenId': tokenId,
      'make.assetType.contract': contract.toLowerCase(),
      $and: [{ $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] }],
    });
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
    ) as unknown as PipelineStage[];

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

    return results;
  }

  public async updateById(newOrder: any): Promise<any> {
    return await this.ordersModel.updateOne({ _id: newOrder._id }, newOrder);
  }

  public async staleOrder(order: any): Promise<any> {
    return await this.ordersModel.updateOne(
      { hash: order.hash },
      { status: OrderStatus.STALE },
    );
  }

  public async updateMany(newOrders: any): Promise<any> {
    return await await this.ordersModel.bulkSave(newOrders);
  }

  public async updateErc1155TokenBalance(order: any, newBalance: string) {
    await this.ordersModel.updateOne(
      { hash: order.hash },
      { erc1155TokenBalance: newBalance },
    );
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

  async queryOrdersForStale(orderCreator: string, orderNftInfo: Asset) {
    // 1. Mark any sell offers as stale. They can't be executed anymore as the owner has changed

    const queryFilters = {
      side: OrderSide.SELL,
      status: {
        $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED],
      },
      maker: orderCreator.toLowerCase(),
      'make.assetType.tokenId': orderNftInfo.assetType.tokenId,
    } as any;

    // ETH orders don't have contract
    if (orderNftInfo.assetType.contract) {
      queryFilters['make.assetType.contract'] =
        orderNftInfo.assetType.contract.toLowerCase();
    }

    const sellOffers = await this.ordersModel.find(queryFilters);
    return sellOffers;
  }

  async queryOrderForStale(
    tokenId: string,
    contract: string,
    maker: string,
    utcTimestamp: number,
  ) {
    return await this.ordersModel.findOne({
      $and: [
        {
          status: OrderStatus.CREATED,
          side: OrderSide.SELL,
          maker: maker,
          'make.assetType.contract': contract.toLowerCase(),
          'make.assetType.tokenId': tokenId,
        },
        {
          $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }],
        },
      ],
    });
  }

  public async getErc1155OrdersToStale(
    contract: string,
    erc1155tokenIds: Array<any>,
    orderMaker: string,
    utcTimestamp: number,
  ) {
    return await this.ordersModel.find({
      $and: [
        {
          status: {
            $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED],
          },
        },
        { side: OrderSide.SELL },
        { maker: orderMaker },
        { 'make.assetType.contract': contract },
        {
          'make.assetType.tokenId': {
            $in: erc1155tokenIds,
          },
        },
        {
          $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
        },
        { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
      ],
    });
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
    const queryFilters = [] as any;

    switch (Number(query.side)) {
      case OrderSide.SELL:
        queryFilters.push({
          side: OrderSide.SELL,
        });
        break;
      case OrderSide.BUY:
        queryFilters.push({
          side: OrderSide.BUY,
        });
        break;
      default:
        break;
    }

    // activity
    switch (query.activity) {
      case OrderActivity.INACTIVE:
        queryFilters.push({
          $or: [
            { start: { $gt: utcTimestamp } },
            { end: { $lt: utcTimestamp } },
          ],
        });
        break;
      case OrderActivity.FUTURE:
        queryFilters.push({
          start: { $gt: utcTimestamp },
        });
        break;
      case OrderActivity.PASSED:
        queryFilters.push({
          end: { $lt: utcTimestamp },
        });
        break;
      case OrderActivity.ALL:
        // nothing here!
        break;
      case OrderActivity.ACTIVE:
      default:
        queryFilters.push({
          $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
        });
        queryFilters.push({
          $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }],
        });
        break;
    }

    // status
    if (query.status) {
      const status = query.status.split(',');
      if (status.length > 1) {
        queryFilters.push({
          status: {
            $in: status.map((statusValue) => {
              return OrderStatus[OrderStatus[Number(statusValue)]];
            }),
          },
        });
      } else {
        queryFilters.push({
          status: OrderStatus[OrderStatus[Number(status[0])]],
        });
      }
    } else {
      // default status
      queryFilters.push({
        status: {
          $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED],
        },
      });
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
        queryFilters.push({
          'take.assetType.contract': query.token.toLowerCase(),
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
   * Returns offers (OrderSide.BUY orders) created by offerCreator for asset.
   * Asset describes the listing details that these offers are made for.
   * @param offerCreator
   * @param asset
   * @returns {Promise<any[]>}
   */
  public async getOffersByCreatorAndAsset(offerCreator: string, asset: Asset) {
    return await this.ordersModel.find({
      side: OrderSide.BUY,
      status: {
        $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED],
      },
      maker: offerCreator.toLowerCase(),
      'take.assetType.contract': asset.assetType.contract,
      'take.assetType.tokenId': asset.assetType.tokenId,
    });
  }
}