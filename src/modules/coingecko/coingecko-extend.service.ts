import { CoingeckoService } from './coingecko.service';
import { AppConfig } from '../configuration/configuration.service';
import { InjectModel } from '@nestjs/mongoose';
import { TokenPrice } from './token-price.entity';
import { Model } from 'mongoose';
import { TokenPricesDocument } from './schema/token-prices.schema';

export class CoingeckoServiceExtend extends CoingeckoService {
  constructor(
    config: AppConfig,
    @InjectModel(TokenPrice.name)
    tokensModel: Model<TokenPricesDocument>,
  ) {
    super(config, tokensModel);
  }

  async updatePricesExtended() {
    return await this.updatePrices();
  }
}
