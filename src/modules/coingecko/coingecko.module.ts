import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';
import { CoingeckoService } from './coingecko.service';
import { MongooseModule } from '@nestjs/mongoose';
import { TokenPricesSchema } from './schema/token-prices.schema';
import { CoingeckoController } from './coingecko.controller';
import { TokenPrice } from './token-price.entity';

@Global()
@Module({
  imports: [
    AppConfig,
    MongooseModule.forFeature([
      { name: TokenPrice.name, schema: TokenPricesSchema },
    ]),
  ],
  providers: [CoingeckoService, AppConfig],
  controllers: [CoingeckoController],
  exports: [CoingeckoService],
})
export class CoingeckoModule {}
