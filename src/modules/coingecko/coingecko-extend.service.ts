import { CoingeckoService } from './coingecko.service';
import { AppConfig } from '../configuration/configuration.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TokenPricesDocument, TokenPrices } from './schema/token-prices.schema';

export class CoingeckoServiceExtend extends CoingeckoService {
  constructor(
    config: AppConfig,
    @InjectModel(TokenPrices.name)
    tokensModel: Model<TokenPricesDocument>,
  ) {
    super(config, tokensModel);
  }

  async updatePricesExtended() {
    return await this.updatePrices();
  }
}
