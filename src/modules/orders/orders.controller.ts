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
// import { OrdersService } from './orders.service';
import { BaseController } from '../../common/base.controller';
import { MarketplaceValidationPipe } from '../../common/pipes/marketplace-validation.pipe';
import { OrdersService } from './mongo-orders.service';

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
  @ApiOperation({
    summary: 'Filter and return all kind of orders',
  })
  @UsePipes(MarketplaceValidationPipe)
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

  @Get('browse')
  @ApiOperation({
    summary: 'Filter and return active sell orders',
  })
  @UsePipes(MarketplaceValidationPipe)
  async fetchBrowsePage(@Query() query: QueryDto) {
    try {
      return await this.orderService.queryBrowsePage(query);
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Get('listing/:collectionAddress/:tokenId')
  @ApiOperation({
    summary: 'Find active sell order for a specific NFT',
  })
  @UsePipes(MarketplaceValidationPipe)
  async fetchSingleListing(
    @Param('collectionAddress') collectionAddress,
    @Param('tokenId') tokenId,
  ) {
    try {
      return await this.orderService.queryOne(collectionAddress, tokenId);
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Get('listing/:collectionAddress/:tokenId/history')
  @ApiOperation({
    summary: 'Find active sell order for a specific NFT',
  })
  @UsePipes(MarketplaceValidationPipe)
  async fetchListingHistory(
    @Param('collectionAddress') collectionAddress,
    @Param('tokenId') tokenId,
  ) {
    try {
      return await this.orderService.fetchListingHistory(
        collectionAddress,
        tokenId,
      );
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Get('collection/:collection')
  @UsePipes(MarketplaceValidationPipe)
  @ApiOperation({
    summary: 'Get additional info about a collection.',
  })
  async getCollection(@Param('collection') collection: string) {
    try {
      return await this.orderService.getCollection(collection);
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Get(':hash')
  @ApiOperation({ summary: 'Get order data by hash.' })
  async getOrder(@Param('hash') hash: string) {
    try {
      const result: any = await this.orderService.getOrderByHash(hash);
      if (result) {
        result.encoded = this.orderService.encode(result);
      }
      return result;
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
