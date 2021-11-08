import { Body, Controller, Post } from '@nestjs/common';
import { OrderDto } from './order.dto';
import { OrdersService } from './orders.service';

@Controller('orders/encoder')
export class OrderEncodersController {
  constructor(private orderService: OrdersService) {}

  @Post('order')
  async encodeOrder(@Body() body: OrderDto) {
    // TODO: Potential Defense code

    const order = this.orderService.convertToOrder(body);
    const encodedOrder = this.orderService.encode(order);
    return encodedOrder;
  }
}
