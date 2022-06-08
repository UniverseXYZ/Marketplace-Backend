import { OrdersService } from '../src/modules/orders/mongo-orders.service';
import { Order } from '../src/modules/orders/order.entity';

export class MockOrdersService extends OrdersService {
  public async checkSubscribe(maker: string) {
    // do not do anything in the mock!
  }
}
