import { 
  Body, 
  Controller, 
  Post, 
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BaseController } from '../../common/base.controller';
import { OrderDto } from './order.dto';
import { OrdersService } from './orders.service';
import { MarketplaceValidationPipe } from '../../common/pipes/marketplace-validation.pipe';

@Controller('orders/encoder')
@ApiTags('Orderbook')
export class OrderEncodersController extends BaseController {
  
  constructor(private orderService: OrdersService) {
    super(OrderEncodersController.name);
  }

  @Post('order')
  @UsePipes(MarketplaceValidationPipe)
  async encodeOrder(@Body() body: OrderDto) {
    try {
      const order = this.orderService.convertToOrder(body);
      const encodedOrder = this.orderService.encode(order);
      return encodedOrder;
    } catch(e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }
}
