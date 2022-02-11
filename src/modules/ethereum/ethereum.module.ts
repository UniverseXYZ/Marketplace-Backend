import { Module } from '@nestjs/common';
import { AppConfigModule } from '../configuration/configuration.module';
// import { MulticallModule } from '../multicall/multicall.module';
import { EthereumService } from './ethereum.service';

@Module({
  imports: [
    AppConfigModule,
    // MulticallModule
  ],
  providers: [EthereumService],
  exports: [EthereumService],
})
export class EthereumModule {}
