import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';
import { CoingeckoService } from './coingecko.service';

@Global()
@Module({
  imports: [AppConfig],
  providers: [CoingeckoService, AppConfig],
  exports: [CoingeckoService],
})
export class CoingeckoModule {}
