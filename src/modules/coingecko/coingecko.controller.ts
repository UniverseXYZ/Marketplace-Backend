import { Controller, Get, Param } from '@nestjs/common';

import { BaseController } from '../../common/base.controller';
import { CoingeckoService } from './coingecko.service';

@Controller('tokenPrices')
export class CoingeckoController extends BaseController {
  constructor(private coingeckoService: CoingeckoService) {
    super(CoingeckoController.name);
  }

  @Get('')
  async getTokenPrices() {
    try {
      return await this.coingeckoService.queryAll();
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }

  @Get(':token')
  async getToken(@Param('token') token: string) {
    try {
      return await this.coingeckoService.queryByName(token);
    } catch (e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }
}
