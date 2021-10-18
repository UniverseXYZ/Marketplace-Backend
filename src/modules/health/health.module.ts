import { Module } from '@nestjs/common';
import { TerminusModule, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { EthHealthModule } from '../eth-health/eth-health.module';
import { EthHealthIndicator } from '../eth-health/eth-health.service';
import { EthereumModule } from '../ethereum/ethereum.module';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, EthHealthModule, EthereumModule],
  providers: [TypeOrmHealthIndicator, EthHealthIndicator],
  controllers: [HealthController],
})
export class HealthModule {}
