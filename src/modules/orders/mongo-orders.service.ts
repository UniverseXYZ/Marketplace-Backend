import { Inject, Injectable, Logger } from '@nestjs/common';
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
import {
  ETHEREUM_SERVICE,
  IEthereumService,
} from '../ethereum/interface/IEthereumService';
import {
  IDataLayerService,
  DATA_LAYER_SERVICE,
} from 'src/modules/data-layer/interfaces/IDataLayerInterface';

@Injectable()
export class OrdersService {
  private watchdogUrl;
  private logger;

  constructor(
    private readonly config: AppConfig,

    private readonly httpService: HttpService,

    @Inject(ETHEREUM_SERVICE)
    private readonly ethereumService: IEthereumService,

    @Inject(DATA_LAYER_SERVICE)
    private readonly dataLayerService: IDataLayerService,

    @InjectModel(Order.name)
    private readonly ordersModel: Model<OrderDocument>,

    private readonly coingecko: CoingeckoService,
  ) {
    const watchdogUrl = R.path(['WATCHDOG_URL'], config.values);
    // if (R.isNil(watchdogUrl)) {
    //   throw new Error('Watchdog endpoint is missing');
    // }
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

    // @TODO Remove when the support for bundles is added
    if (AssetClass.ERC721_BUNDLE === order.make.assetType.assetClass) {
      throw new MarketplaceException('Support for bundles is coming up...');
    }

    // Check if order for the nft already exists
    // @TODO add support for ERC721_BUNDLE
    if (order.side === OrderSide.SELL) {
      const existingOrder = await this.ordersModel.findOne({
        side: OrderSide.SELL,
        status: { $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED] },
        make: {
          assetType: {
            tokenId: order.make.assetType.tokenId,
            contract: order.make.assetType.contract.toLowerCase(),
          },
        },
        $and: [{ $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] }],
      });

      if (existingOrder) {
        throw new MarketplaceException(constants.ORDER_ALREADY_EXISTS);
      }
    }

    // check salt along with the signature (just in case)
    const salt = await this.dataLayerService.getSaltByWalletAddress(data.maker);
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

    const savedOrder = await this.dataLayerService.createOrder(order);
    // await this.staleOrdersWithHigherPrice(savedOrder);
    this.checkSubscribe(savedOrder.maker);
    return savedOrder;
  }

  public async prepareOrderExecution(hash: string, data: PrepareTxDto) {
    // 1. get sell/left order
    const leftOrder = await this.dataLayerService.getOrderByHash(hash);
    if (leftOrder) {
      //TODO: What happens if the order is canceled?
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
      taker: orderDto.taker.toLowerCase(),
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
      matchedTxHash: '',
      hash: '',
    };

    if (NftTokens.includes(order.make.assetType.assetClass)) {
      order.side = OrderSide.SELL;
    } else if (AssetClass.ERC20 === order.make.assetType.assetClass) {
      order.side = OrderSide.BUY;
    } else {
      throw new MarketplaceException(constants.INVALID_ASSET_CLASS);
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

  public async queryAll(query: QueryDto) {
    query.page = Number(query.page) || 1;
    query.limit = !Number(query.limit)
      ? constants.DEFAULT_LIMIT
      : Number(query.limit) <= constants.OFFSET_LIMIT
      ? Number(query.limit)
      : constants.OFFSET_LIMIT;

    const skippedItems = (query.page - 1) * query.limit;

    const side = Number(query.side);

    if (side && side !== OrderSide.BUY && side !== OrderSide.SELL) {
      throw new MarketplaceException(constants.INVALID_ORDER_SIDE);
    }

    const utcTimestamp = Utils.getUtcTimestamp();

    const { prices, addresses, decimals } = this.getERC20TokensInfo();

    return this.dataLayerService.queryAll(
      query,
      utcTimestamp,
      skippedItems,
      prices,
      addresses,
      decimals,
    );
  }

  private getERC20TokensInfo() {
    const prices = [
      this.coingecko.tokenUsdValues[TOKENS.ETH],
      this.coingecko.tokenUsdValues[TOKENS.USDC],
      this.coingecko.tokenUsdValues[TOKENS.XYZ],
      this.coingecko.tokenUsdValues[TOKENS.DAI],
      this.coingecko.tokenUsdValues[TOKENS.WETH],
    ];

    const addresses = [
      this.coingecko.tokenAddresses[TOKENS.ETH],
      this.coingecko.tokenAddresses[TOKENS.USDC],
      this.coingecko.tokenAddresses[TOKENS.XYZ],
      this.coingecko.tokenAddresses[TOKENS.DAI],
      this.coingecko.tokenAddresses[TOKENS.WETH],
    ];

    const decimals = [
      TOKEN_DECIMALS[TOKENS.ETH],
      TOKEN_DECIMALS[TOKENS.USDC],
      TOKEN_DECIMALS[TOKENS.XYZ],
      TOKEN_DECIMALS[TOKENS.DAI],
      TOKEN_DECIMALS[TOKENS.WETH],
    ];

    return { prices, addresses, decimals };
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
    const { prices, addresses, decimals } = this.getERC20TokensInfo();

    const [bestOffer, lastOffer] =
      await this.dataLayerService.getBestAndLastOffer(
        utcTimestamp,
        tokenId,
        contract,
        prices,
        addresses,
        decimals,
      );

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

    const results = await this.dataLayerService.queryOrders(
      utcTimestamp,
      maker,
      contract,
    );

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
        const leftOrder = await this.dataLayerService.getOrderByHash(
          event.leftOrderHash,
        );

        if (leftOrder) {
          if (
            OrderStatus.CREATED == leftOrder.status ||
            // stale orders also need to be able to be marked as filled
            // because of the Watchdog.
            OrderStatus.STALE == leftOrder.status
          ) {
            this.logger.log(
              `The matched order has been found. Order left hash: ${event.leftOrderHash}`,
            );
            leftOrder.status = OrderStatus.FILLED;
            leftOrder.matchedTxHash = event.txHash;

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

            await this.dataLayerService.updateById(leftOrder);
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
            await this.markRelatedOrdersAsStale(leftOrder as Order);
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
          `Error marking order as filled. Event: ${JSON.stringify(event)}`,
        );
      }
    }

    return value;
  }

  public async fetchListingHistory(contract: string, tokenId: string) {
    return await this.dataLayerService.getOrderListingHistoryAndCount(
      contract,
      tokenId,
    );
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

    const sellOffers = await this.dataLayerService.queryStaleOrders(
      orderCreator,
      orderNftInfo,
    );

    this.logger.log(
      `Found ${sellOffers.length} sell offers related to an order match`,
    );

    if (sellOffers.length) {
      sellOffers.forEach((offer) => {
        offer.status = OrderStatus.STALE;
        this.checkUnsubscribe(offer.maker);
      });
      await this.dataLayerService.updateMany(sellOffers);
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
        const queryResult = await this.dataLayerService.cancelOrder(event);

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
    // const matchedOne = await this.queryOne(address, erc721TokenId, fromAddress);

    // @TODO add support for ERC721_BUNDLE
    const utcTimestamp = Utils.getUtcTimestamp();
    const matchedOne = await this.ordersModel.findOne({
      $and: [
        {
          status: OrderStatus.CREATED,
          side: OrderSide.SELL,
          maker: fromAddress.toLowerCase(),
          'make.assetType.contract': address.toLowerCase(),
          'make.assetType.tokenId': erc721TokenId,
        },
        {
          $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }],
        },
      ],
    });
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

    await this.dataLayerService.staleOrder(matchedOne);

    this.checkUnsubscribe(matchedOne.maker);
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
    const pendingOrders = await this.dataLayerService.fetchPendingOrders(
      walletAddress,
    );

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

  public async checkSubscribe(maker: string) {
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
        ordersWithHigherPrice =
          await this.dataLayerService.fetchOrdersWithHigherPrice(
            orderWithLowerPrice,
          );
      } else if (
        AssetClass.ERC721_BUNDLE ===
        orderWithLowerPrice.make.assetType.assetClass
      ) {
        // @TODO Add support for ERC721_BUNDLE
      }

      for (const orderWithHigherPrice of ordersWithHigherPrice) {
        orderWithHigherPrice.status = OrderStatus.STALE;
      }
      await this.dataLayerService.updateMany(ordersWithHigherPrice);
    }
  }

  /**
   *
   * @param collection Nft token collection address
   * @returns {Promise<string>} string represantation of the floor price in wei.
   */
  private async getCollectionFloorPrice(collection: string): Promise<string> {
    const utcTimestamp = Utils.getUtcTimestamp();

    const lowestOrder = await this.dataLayerService.fetchLowestOrder(
      collection,
      utcTimestamp,
    );

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
    const orders = await this.dataLayerService.fetchVolumeTraded(collection);

    return orders;
  }
}
