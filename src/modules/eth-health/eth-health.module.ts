import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AppConfigModule } from '../configuration/configuration.module';
import { EthereumModule } from '../ethereum/ethereum.module';
import { EthereumService } from '../ethereum/ethereum.service';
import { EthHealthIndicator } from './eth-health.service';

@Module({
  imports: [EthereumModule, TerminusModule, AppConfigModule],
  providers: [EthHealthIndicator],
  exports: [EthHealthIndicator],
})
export class EthHealthModule {}
