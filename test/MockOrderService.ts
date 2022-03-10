import { OrdersService } from '../src/modules/orders/orders.service';
import { Order } from '../src/modules/orders/order.entity';

export class MockOrdersService extends OrdersService {
  protected async checkSubscribe(order: Order) {
    // do not do anything in the mock!
  }
}
