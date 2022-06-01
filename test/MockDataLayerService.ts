import { IDataLayerService } from 'src/modules/data-layer/interfaces/IDataLayerInterface';
import {
  CancelOrder,
  CreateOrderDto,
  QueryDto,
} from 'src/modules/orders/order.dto';
import { Asset, OrderSide } from 'src/modules/orders/order.types';
import { OrderDocument } from 'src/modules/orders/schema/order.schema';

export class MockDataLayerService implements IDataLayerService {
  getOrderByHash(hash: string) {
    throw new Error('Method not implemented.');
  }
  getBuyOrdersBefore(utcTimestamp: number) {
    throw new Error('Method not implemented.');
  }
  getBestAndLastOffer(
    utcTimestamp: number,
    tokenId: string,
    contract: string,
    prices: number[],
    addresses: string[],
    decimals: number[],
  ) {
    throw new Error('Method not implemented.');
  }
  queryOrders(utcTimestamp: number, maker: string, contract: string) {
    throw new Error('Method not implemented.');
  }
  getOrderListingHistoryAndCount(contract: string, tokenId: string) {
    throw new Error('Method not implemented.');
  }
  updateById(newOrder: any) {
    throw new Error('Method not implemented.');
  }
  updateMany(newOrders: any) {
    throw new Error('Method not implemented.');
  }
  cancelOrder(event: CancelOrder) {
    throw new Error('Method not implemented.');
  }
  staleOrder(order: any) {
    throw new Error('Method not implemented.');
  }
  fetchPendingOrders(walletAddress: string) {
    throw new Error('Method not implemented.');
  }
  queryStaleOrders(orderCreator: string, orderNftInfo: Asset) {
    throw new Error('Method not implemented.');
  }
  fetchOrdersWithHigherPrice(orderWithLowerPrice: OrderDocument) {
    throw new Error('Method not implemented.');
  }
  fetchLowestOrder(collection: string, utcTimestamp: number) {
    throw new Error('Method not implemented.');
  }
  fetchVolumeTraded(collection: string) {
    throw new Error('Method not implemented.');
  }
  buildPriceAggregation(
    prices: number[],
    tokenAdresses: string[],
    decimals: number[],
    orderSide: OrderSide,
  ) {
    throw new Error('Method not implemented.');
  }
  queryAll(
    query: QueryDto,
    utcTimestamp: number,
    skippedItems: number,
    prices: number[],
    tokenAdresses: string[],
    decimals: number[],
  ) {
    throw new Error('Method not implemented.');
  }
  addEndSortingAggregation() {
    throw new Error('Method not implemented.');
  }
  createOrder(order: CreateOrderDto) {
    return order;
  }
  findExistingActiveOrder(
    tokenId: string,
    contract: string,
    utcTimestamp: number,
  ) {
    return null;
  }

  async getSaltByWalletAddress(walletAddress: string) {
    return 0;
  }

  queryOrderForStale() {
    throw new Error('Method not implemented.');
  }
}
