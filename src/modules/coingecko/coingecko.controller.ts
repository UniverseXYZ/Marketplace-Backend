import { Controller, Get, Param } from '@nestjs/common';

import { BaseController } from '../../common/base.controller';
import { CoingeckoService } from './coingecko.service';

@Controller('tokenPrices')
export class TokensController extends BaseController {
  constructor(private coingeckoService: CoingeckoService) {
    super(TokensController.name);
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
