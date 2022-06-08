import { Module } from '@nestjs/common';
import { AppConfigModule } from '../configuration/configuration.module';
// import { MulticallModule } from '../multicall/multicall.module';
import { EthereumService } from './ethereum.service';
import { ETHEREUM_SERVICE } from './interface/IEthereumService';

@Module({
  imports: [
    AppConfigModule,
    // MulticallModule
  ],
  providers: [
    {
      useClass: EthereumService,
      provide: ETHEREUM_SERVICE,
    },
  ],
  exports: [ETHEREUM_SERVICE],
})
export class EthereumModule {}
