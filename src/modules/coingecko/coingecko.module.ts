import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';
import { CoingeckoService } from './coingecko.service';
import { Token } from './tokens.entity';
import { MongooseModule } from '@nestjs/mongoose';
import { TokenPricesSchema } from '../orders/schema/token-prices.schema';
import { TokensController } from './coingecko.controller';

@Global()
@Module({
  imports: [
    AppConfig,
    MongooseModule.forFeature([
      { name: Token.name, schema: TokenPricesSchema },
    ]),
  ],
  providers: [CoingeckoService, AppConfig],
  controllers: [TokensController],
  exports: [CoingeckoService],
})
export class CoingeckoModule {}
