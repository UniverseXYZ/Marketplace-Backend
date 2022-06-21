import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppConfig } from '../configuration/configuration.service';
import { CoingeckoService } from './coingecko.service';
import { MongooseModule } from '@nestjs/mongoose';
import { TokenPricesSchema, TokenPrices } from './schema/token-prices.schema';
import { CoingeckoController } from './coingecko.controller';

@Global()
@Module({
  imports: [
    AppConfig,
    HttpModule,
    MongooseModule.forFeature([
      { name: TokenPrices.name, schema: TokenPricesSchema },
    ]),
  ],
  providers: [CoingeckoService, AppConfig],
  controllers: [CoingeckoController],
  exports: [CoingeckoService],
})
export class CoingeckoModule {}
