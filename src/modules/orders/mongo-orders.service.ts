import { Inject, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import R from 'ramda';
import {
  encodeAssetClass,
  encodeAssetData,
  encodeOrderData,
  hashOrderKey,
} from '../../common/utils/order-encoder';
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
import { CoingeckoService } from '../coingecko/coingecko.service';
import { TOKENS, TOKEN_DECIMALS } from '../coingecko/tokens.config';
import { Order, OrderDocument } from './schema/order.schema';
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
    this.removeUnexpectedPropeties(data);

    const order = this.convertToOrder(data);
    const utcTimestamp = Utils.getUtcTimestamp();

    // @TODO Remove when the support for bundles is added
    if (AssetClass.ERC721_BUNDLE === order.make.assetType.assetClass) {
      throw new MarketplaceException('Support for bundles is coming up...');
    }

    // Check if order for the nft already exists
    // @TODO add support for ERC721_BUNDLE
    if (order.side === OrderSide.SELL) {
      const existingOrders = await this.dataLayerService.findExistingOrders(
        order.make.assetType.tokenId,
        order.make.assetType.contract,
        utcTimestamp,
      );

      // do not allow multiple ERC721 orders with same NFT.
      if (
        AssetClass.ERC721 == order.make.assetType.assetClass &&
        existingOrders.length
      ) {
        throw new MarketplaceException(constants.ORDER_ALREADY_EXISTS);
        // do not allow ERC1155 orders with not enough balance.
      } else if (
        AssetClass.ERC1155 == order.make.assetType.assetClass &&
        existingOrders.length
      ) {
        const existingMakers = existingOrders.map((existingOrder) => {
          return existingOrder.maker.toLowerCase();
        });
        if (existingMakers.includes(order.maker.toLowerCase())) {
          const makerErc1155TokenBalance =
            await this.ethereumService.getErc1155TokenBalance(
              order.make.assetType.contract.toLowerCase(),
              order.make.assetType.tokenId,
              order.maker,
            );
          let requiredBalance = Number(order.make.value);
          existingOrders.forEach((existingOrder) => {
            if (existingOrder.maker == order.maker.toLowerCase()) {
              requiredBalance += Number(existingOrder.make.value);
            }
          });
          if (makerErc1155TokenBalance < BigInt(requiredBalance)) {
            this.logger.error(`
            Wallet ${
              order.maker
            } does not have enough balance of editions of token ${
              order.make.assetType.tokenId
            } on contract ${order.make.assetType.contract.toLowerCase()}. Has ${makerErc1155TokenBalance}, required ${requiredBalance}.`);
            throw new MarketplaceException(
              constants.ERC1155_INSUFFICIENT_BALANCE,
            );
          }
        }
        // a bit extra safe
      } else if (existingOrders.length) {
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

  public removeUnexpectedPropeties(data: CreateOrderDto) {
    if (AssetClass.ERC721_BUNDLE === data.make.assetType.assetClass) {
      delete data.make.assetType.contract;
      delete data.make.assetType.tokenId;
    } else {
      delete data.make.assetType.contracts;
      delete data.make.assetType.tokenIds;
      delete data.make.assetType.bundleName;
      delete data.make.assetType.bundleDescription;
    }

    return data;
  }

  public async getOrderByHash(hash: string) {
    return await this.dataLayerService.getOrderByHash(hash);
  }

  public async getSaltByWalletAddress(address: string) {
    return await this.dataLayerService.getSaltByWalletAddress(address);
  }

  public async prepareOrderExecution(hash: string, data: PrepareTxDto) {
    // 1. get sell/left order
    const leftOrder = await this.dataLayerService.getOrderByHash(hash);
    if (leftOrder) {
      if (
        OrderStatus.CREATED !== leftOrder.status &&
        OrderStatus.PARTIALFILLED !== leftOrder.status
      ) {
        throw new MarketplaceException(constants.CANNOT_EXECUTE_ORDER);
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
      matchedTxHash: null,
      hash: '',
      erc1155TokenBalance: null,
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

  /**
   *
   * @param prepareDto
   * @param leftOrder
   * @returns
   * @throws {MarketplaceException}
   */
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

    // for erc1155 we need to take the value from request (the amount parameter)
    if (AssetClass.ERC1155 == leftOrder.make.assetType.assetClass) {
      const availableAmount =
        Number(leftOrder.make.value) - Number(leftOrder.fill);
      if (
        Math.floor(Number(prepareDto.amount)) < 1 ||
        Math.floor(Number(prepareDto.amount)) > availableAmount
      ) {
        throw new MarketplaceException(constants.ERC1155_INCORRECT_AMOUNT);
      }

      rightOrder.take.value = Math.floor(Number(prepareDto.amount)).toString();
    }

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
    const isValidPageNumber = (number: number) =>
      !isNaN(number) && Number(number) !== 0;

    query.page = isValidPageNumber(query.page) ? Number(query.page) : 1;

    query.limit = !isValidPageNumber(query.limit)
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
    //TODO: Add these validations to all services with contract and token id params
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
      bestOffer: (bestOffer && bestOffer.length && bestOffer[0]) || null,
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
        const tokenIdArray = assetType.tokenIds[collectionIndex] || [];
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

            await this.dataLayerService.updateById(leftOrder);
            this.checkUnsubscribe(leftOrder.maker);

            //stale offers made by the address which has just made a match (direct buy of a listed NFT)
            await this.staleOffersMadeByOwner(leftOrder);

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
    return await this.dataLayerService.getOrderListingHistoryAndCount(
      contract,
      tokenId,
    );
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
    const { fromAddress, toAddress, address, erc721TokenId, erc1155Metadata } =
      event;
    // const matchedOne = await this.queryOne(address, erc721TokenId, fromAddress);

    if (erc721TokenId) {
      // if it is a ERC721 token transfer
      // @TODO add support for ERC721_BUNDLE
      const utcTimestamp = Utils.getUtcTimestamp();
      const matchedOne = await this.dataLayerService.queryOrderForStale(
        erc721TokenId,
        address,
        fromAddress,
        utcTimestamp,
      );
      if (!matchedOne) {
        this.logger.error(
          `Failed to find this order: contract: ${address}, ERC721 tokenId: ${erc721TokenId}, from: ${fromAddress}, to: ${toAddress}`,
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

      this.logger.log(`
        Found ERC721 matching order by alchemy: ${matchedOne.hash}
      `);
      await this.dataLayerService.staleOrder(matchedOne);

      this.checkUnsubscribe(matchedOne.maker);
    } else if (erc1155Metadata) {
      // if it is a ERC1155 token transfer
      const utcTimestamp = Utils.getUtcTimestamp();
      let erc1155tokenIds = erc1155Metadata.map((data) => {
        return data.tokenId;
      });
      erc1155tokenIds = [...new Set(erc1155tokenIds)];

      const erc1155Orders = await this.dataLayerService.getErc1155OrdersToStale(
        address.toLowerCase(),
        erc1155tokenIds,
        fromAddress.toLowerCase(),
        utcTimestamp,
      );
      erc1155Orders.forEach(async (order) => {
        this.logger.log(`
          Found ERC1155 order by alchemy: Hash: ${order.hash}
        `);

        const requiredAmount = Number(order.make.value) - Number(order.fill);
        const erc1155TokenBalance =
          await this.ethereumService.getErc1155TokenBalance(
            address.toLowerCase(),
            order.make.assetType.tokenId,
            fromAddress.toLowerCase(),
          );
        if (BigInt(0) == erc1155TokenBalance) {
          // if the wallet has 0 editions of the token - mark the order as stale
          this.logger.log(
            `Wallet ${fromAddress.toLowerCase()} has balance of ${erc1155TokenBalance} of ERC1155 token id ${
              order.make.assetType.tokenId
            } on contract ${address.toLowerCase()}. Marking this order as stale.`,
          );

          await this.dataLayerService.staleOrder(order);
          this.checkUnsubscribe(order.maker);
        } else if (BigInt(requiredAmount) > erc1155TokenBalance) {
          // if the wallet address has lower token balance than required - put this balance into order.erc1155TokenBalance
          this.logger.log(
            `Wallet ${fromAddress.toLowerCase()} has balance of ${erc1155TokenBalance} of ERC1155 token id ${
              order.make.assetType.tokenId
            } on contract ${address.toLowerCase()} which is lower than required ${requiredAmount}. Writing balance to order.erc1155TokenBalance.`,
          );

          await this.dataLayerService.updateErc1155TokenBalance(
            order,
            erc1155TokenBalance.toString(),
          );
        }
      });

      if (!erc1155Orders.length) {
        this.logger.error(
          `Failed to find this order from alchemy: contract: ${address}, ERC1155 tokenIds: ${JSON.stringify(
            erc1155tokenIds,
          )}, from: ${fromAddress}, to: ${toAddress}`,
        );
      }
    }
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

    const sellOffers = await this.dataLayerService.queryStaleOrders(
      orderCreator,
      orderNftInfo,
    );

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
      await this.dataLayerService.updateMany(sellOffers);
    }
  }

  /**
   * This method looks up for offers (OrderSide.BUY orders) created by the address which has
   * executed the order, and marks these offers as stale.
   * I.e. it is staling offers created by the address which has made a direct buy of an NFT after
   * creating an offer.
   * The executed order is a ERC721 listing.
   * Offers are being staled with no regards to the activity time (start and end properties).
   * It's important to pass order with already populated order.taker and updated order.status.
   * @param order
   */
  private async staleOffersMadeByOwner(order: Order) {
    // only do it for listings (OrderSide.SELL orders)
    if (order.make.assetType.tokenId) {
      if (
        OrderStatus.FILLED === order.status &&
        AssetClass.ERC721 === order.make.assetType.assetClass
      ) {
        const offersToStale =
          await this.dataLayerService.getOffersByCreatorAndAsset(
            order.taker,
            order.make,
          );
        if (offersToStale.length) {
          this.logger.log(
            `Found ${offersToStale.length} offers created by the new owner (${order.taker}) of the sold NFT. Staling all of them...`,
          );
          offersToStale.forEach((offer) => {
            offer.status = OrderStatus.STALE;
          });
          await this.dataLayerService.updateMany(offersToStale);
        }
      }
    }
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
