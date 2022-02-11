import { Body, Controller, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BaseController } from '../../common/base.controller';
import { CancelOrderDto, MatchOrderDto } from './order.dto';
import { OrdersService } from './orders.service';

@Controller('internal')
@ApiTags('Orderbook')
export class OrdersInternalController extends BaseController {
  
  constructor(private orderService: OrdersService) {
    super(OrdersInternalController.name);
  }

  @Put('orders/:hash/match')
  async matchOrder(@Body() body: MatchOrderDto) {
    try {
      await this.orderService.matchOrder(body);
      return 'OK';
    } catch(e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Put('orders/track')
  async cancelOrder(@Body() body: CancelOrderDto) {
    try {
      const { fromAddress, toAddress, address, erc721TokenId } = body;
      const matchedOne = await this.orderService.queryOne(
        address,
        erc721TokenId,
        fromAddress,
      );
      if (!matchedOne) {
        this.logger.error(`Failed to find this order: nft: ${address}, tokenId: ${erc721TokenId}, from: ${fromAddress}, to: ${toAddress}`);
        return 'OK';
      }
      this.logger.log(`Found matching order by alchemy: ${matchedOne.hash}`);
      await this.orderService.cancelOrder(matchedOne.hash);
      return 'OK';
    } catch(e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }
}
