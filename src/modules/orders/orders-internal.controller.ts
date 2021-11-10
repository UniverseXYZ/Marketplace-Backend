import { Body, Controller, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MatchOrderDto } from './order.dto';
import { OrdersService } from './orders.service';

@Controller('internal')
@ApiTags('Orderbook')
export class OrdersInternalController {
  constructor(private orderService: OrdersService) {}

  @Put('orders/:hash/match')
  async matchOrder(@Body() body: MatchOrderDto) {
    // TODO: Check if this order has already matched. In case the same salt was used. And Warning in this case
    // TODO: Add defense code e.g. filter with order status only created
    await this.orderService.matchOrder(body);
    return 'OK';
  }
}
