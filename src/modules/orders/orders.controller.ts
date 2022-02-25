import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Logger,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EthereumService } from '../ethereum/ethereum.service';
import {
  OrderDto,
  CreateOrderDto,
  PrepareTxDto,
  QueryDto,
  GetSaltParamsDto,
} from './order.dto';
import { OrderStatus } from './order.types';
import { OrdersService } from './orders.service';
import { BaseController } from '../../common/base.controller';
import { MarketplaceValidationPipe } from '../../common/pipes/marketplace-validation.pipe';

@Controller('orders')
@ApiTags('Orderbook')
export class OrdersController extends BaseController {
  constructor(
    private orderService: OrdersService,
    private ethereumService: EthereumService,
  ) {
    super(OrdersController.name);
  }

  @Get('')
  async fetchAll(@Query() query: QueryDto) {
    try {
      return await this.orderService.queryAll(query);
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Get('card/:collection/:tokenId')
  async fetchLastAndBestOffer(
    @Param('collection') collection: string,
    @Param('tokenId') tokenId: string,
  ) {
    try {
      return await this.orderService.fetchLastAndBestOffer(collection, tokenId);
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Get(':hash')
  @ApiOperation({ summary: 'Get order data by hash.' })
  async getOrder(@Param('hash') hash: string) {
    try {
      return await this.orderService.getOrderByHash(hash);
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Post('order')
  @UsePipes(MarketplaceValidationPipe)
  @ApiOperation({ summary: 'Create an order.' })
  async createOrder(@Body() body: CreateOrderDto) {
    try {
      return await this.orderService.createOrderAndCheckSubscribe(body);
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Post(':hash/prepare')
  @UsePipes(MarketplaceValidationPipe)
  async prepareOrderExecution(
    @Param('hash') hash: string,
    @Body() body: PrepareTxDto,
  ) {
    try {
      return await this.orderService.prepareOrderExecution(hash, body);
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Get('salt/:walletAddress')
  @ApiOperation({ summary: 'Get the salt for a wallet address.' })
  async getSalt(@Param() params: GetSaltParamsDto) {
    try {
      return {
        salt: await this.orderService.getSaltByWalletAddress(
          params.walletAddress,
        ),
      };
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }
}
