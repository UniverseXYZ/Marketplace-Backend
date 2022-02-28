import { Body, Controller, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BaseController } from '../../common/base.controller';
import { CancelOrderDto, MatchOrderDto, TrackOrderDto } from './order.dto';
import { OrdersService } from './orders.service';

@Controller('internal')
@ApiTags('Orderbook')
export class OrdersInternalController extends BaseController {
  constructor(private orderService: OrdersService) {
    super(OrdersInternalController.name);
  }

  @Put('orders/match')
  async matchOrder(@Body() body: MatchOrderDto) {
    try {
      await this.orderService.matchOrder(body);
      return 'OK';
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Put('orders/cancel')
  async cancelOrder(@Body() body: CancelOrderDto) {
    try {
      await this.orderService.cancelOrder(body);
      return 'OK';
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Put('orders/track')
  async trackOrder(@Body() body: TrackOrderDto) {
    try {
      await this.orderService.staleOrder(body);
      return 'OK';
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }
}
