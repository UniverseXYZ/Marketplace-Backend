import { IDataLayerService } from 'src/modules/data-layer/interfaces/IDataLayerInterface';
import { CreateOrderDto } from 'src/modules/orders/order.dto';

export class MockDataLayerService implements IDataLayerService {
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
}
