import { Body, Controller, Put, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BaseController } from '../../common/base.controller';
import { CancelOrderDto, MatchOrderDto, TrackOrderDto } from './order.dto';
// import { OrdersService } from './orders.service';
import { OrdersService } from './mongo-orders.service';

@Controller('internal')
@ApiTags('Orderbook')
export class OrdersInternalController extends BaseController {
  constructor(private orderService: OrdersService) {
    super(OrdersInternalController.name);
  }

  @Put('orders/match')
  @ApiOperation({
    summary:
      'Mark orders as matched. Intented to be used by the Marketplace-Indexer.',
  })
  async matchOrder(@Body() body: MatchOrderDto) {
    try {
      return await this.orderService.matchOrders(body.events);
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Put('orders/cancel')
  @ApiOperation({
    summary:
      'Mark orders as cancelled. Intented to be used by the Marketplace-Indexer.',
  })
  async cancelOrder(@Body() body: CancelOrderDto) {
    try {
      return await this.orderService.cancelOrders(body.events);
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
