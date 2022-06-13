import {
  CancelOrder,
  CreateOrderDto,
  QueryDto,
} from 'src/modules/orders/order.dto';
import { Asset, OrderSide } from 'src/modules/orders/order.types';
import { OrderDocument } from 'src/modules/orders/schema/order.schema';

export const DATA_LAYER_SERVICE = 'DATA LAYER SERVICE';

export interface IDataLayerService {
  createOrder(order: CreateOrderDto);

  findExistingOrder(tokenId: string, contract: string, utcTimestamp: number);

  bundleContainsListedNft(
    tokenIds: Array<any>,
    contracts: Array<any>,
    utcTimestamp: number,
  );

  getSaltByWalletAddress(walletAddress: string): Promise<number>;

  getOrderByHash(hash: string);

  getBuyOrdersBefore(utcTimestamp: number);

  getBestAndLastOffer(
    utcTimestamp: number,
    tokenId: string,
    contract: string,
    prices: number[],
    addresses: string[],
    decimals: number[],
  );

  queryOrders(utcTimestamp: number, maker: string, contract: string);

  getOrderListingHistoryAndCount(contract: string, tokenId: string);

  updateById(newOrder: any);

  updateMany(newOrders: any);

  cancelOrder(event: CancelOrder);

  staleOrders(orders: any);

  fetchPendingOrders(walletAddress: string);

  queryStaleOrders(orderNftInfo: Asset, orderTaker: string);

  queryOrdersForStale(
    tokenId: string,
    contract: string,
    maker: string,
    utcTimestamp: number,
  );

  fetchOrdersWithHigherPrice(orderWithLowerPrice: OrderDocument);

  fetchLowestOrder(collection: string, utcTimestamp: number);

  fetchVolumeTraded(collection: string);

  buildPriceAggregation(
    prices: number[],
    tokenAdresses: string[],
    decimals: number[],
    orderSide: OrderSide,
  );

  queryAll(
    query: QueryDto,
    utcTimestamp: number,
    skippedItems: number,
    prices: number[],
    tokenAdresses: string[],
    decimals: number[],
  );

  addEndSortingAggregation();

  getSellOrderByBundleAndMaker(bundle: Asset, maker: string);
}
