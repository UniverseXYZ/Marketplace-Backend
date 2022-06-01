import { Body, Controller, Put, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BaseController } from '../../common/base.controller';
import { CancelOrderDto, MatchOrderDto, TrackOrderDto } from './order.dto';
import { OrdersService } from './orders.service';
import { OrdersService as MongoOrdersService } from './mongo-orders.service';

@Controller('internal')
@ApiTags('Orderbook')
export class OrdersInternalController extends BaseController {
  constructor(
    private orderService: OrdersService,
    private mongoOrderService: MongoOrdersService,
  ) {
    super(OrdersInternalController.name);
  }

  @Put('orders/match')
  @ApiOperation({
    summary:
      'Mark orders as matched. Intented to be used by the Marketplace-Indexer.',
  })
  async matchOrder(@Body() body: MatchOrderDto) {
    try {
      const [postgreResult, mongoResult] = await Promise.all([
        this.orderService.matchOrders(body.events),
        this.mongoOrderService.matchOrders(body.events),
      ]);
      return postgreResult;
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
      const [postgreResult, mongoResult] = await Promise.all([
        this.orderService.cancelOrders(body.events),
        this.mongoOrderService.cancelOrders(body.events),
      ]);
      return postgreResult;
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Put('orders/track')
  async trackOrder(@Body() body: TrackOrderDto) {
    try {
      await this.orderService.staleOrder(body);
      const [postgreResult, mongoResult] = await Promise.all([
        this.orderService.staleOrder(body),
        this.mongoOrderService.staleOrder(body),
      ]);
      return 'OK';
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }
}
