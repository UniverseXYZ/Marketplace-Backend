import { Body, Controller, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CancelOrderDto, MatchOrderDto } from './order.dto';
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

  @Put('orders/track')
  async cancelOrder(@Body() body: CancelOrderDto) {
    const { fromAddress, toAddress, address, erc721TokenId } = body;
    const matchedOne = await this.orderService.queryOne(
      address,
      parseInt(erc721TokenId, 16),
      fromAddress,
    );
    if (!matchedOne) {
      console.log(
        `Failed to find this order: nft: ${address}, tokenId: ${erc721TokenId}, from: ${fromAddress}, to: ${toAddress}`,
      );
      return 'OK';
    }
    console.log(
      `kun debug: find the matching order by alchemy: ${matchedOne.hash}`,
    );
    await this.orderService.cancelOrder(matchedOne.hash);
    return 'OK';
  }
}
