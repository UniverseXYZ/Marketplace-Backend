import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { EthereumService } from '../ethereum/ethereum.service';
import { MatchOrderDto, OrderDto, PrepareTxDto, QueryDto } from './order.dto';
import { OrderStatus } from './order.types';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private orderService: OrdersService,
    private ethereumService: EthereumService,
  ) {}

  @Get('')
  async fetchAll(@Query() query: QueryDto) {
    query.page = query.page || 1;
    query.limit = query.limit || 10;
    const orders = await this.orderService.queryAll(query);
    return orders;
  }

  @Get(':hash')
  async getOrder(@Param('hash') hash: string) {
    const order = await this.orderService.getOrderByHash(hash);
    return order;
  }

  @Post('order')
  async createOrder(@Body() body: OrderDto) {
    // TODO: Potential Defense code

    // TODO: check signature
    if (!body.signature) {
      throw new Error('Signature is missing');
    }

    // TODO: verifySignature

    // TODO: check salt along with the signature. e.g. one maker should use a different salt for different signature

    // TODO: verify make token Allowance
    // e.g. 1. if NFT getApproved to the exchange contract
    // e.g. 2. if maker is the owener of NFT. maybe frontend should do the check as its from makers' wallet

    const order = this.orderService.convertToOrder(body);
    const savedOrder = await this.orderService.saveOrder(order);
    return savedOrder;
  }

  @Post(':hash/prepare')
  async prepareOrderExecution(
    @Param('hash') hash: string,
    @Body() body: PrepareTxDto,
  ) {
    // 1. get sell/left order
    const leftOrder = await this.orderService.getOrderByHash(hash);

    if (leftOrder.status !== OrderStatus.CREATED) {
      // TODO: Return badrequest
      throw new Error('Order has been filled');
    }
    // TODO: verify if maker's token got approved to transfer proxy
    // TODO: check if the left order is a buy eth-order. We won't support the seller to send a eth-order.

    // 2. generate the oppsite right order
    const rightOrder = this.orderService.convertToRightOrder(body, leftOrder);

    // 3. generate the match tx
    const value = this.ethereumService.calculateTxValue(
      leftOrder.make.assetType.assetClass,
      leftOrder.make.value,
      leftOrder.take.assetType.assetClass,
      leftOrder.take.value,
    );

    const tx = await this.ethereumService.prepareMatchTx(
      this.orderService.encode(leftOrder),
      leftOrder.signature,
      this.orderService.encode(rightOrder),
      body.maker,
      value.toString(),
    );
    return tx;
  }

  @Put(':hash/match')
  async matchOrder(@Body() body: MatchOrderDto) {
    // TODO: Check if this order has already matched. In case the same salt was used. And Warning in this case
    // TODO: Add defense code e.g. filter with order status only created
    await this.orderService.matchOrder(body);
    return 'OK';
  }
}
