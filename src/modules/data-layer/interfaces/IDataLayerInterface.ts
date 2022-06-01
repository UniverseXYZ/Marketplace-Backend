import { CreateOrderDto } from 'src/modules/orders/order.dto';

export const DATA_LAYER_SERVICE = 'DATA LAYER SERVICE';

export interface IDataLayerService {
  createOrder(order: CreateOrderDto);

  findExistingActiveOrder(
    tokenId: string,
    contract: string,
    utcTimestamp: number,
  );

  getSaltByWalletAddress(walletAddress: string): Promise<number>;
}
