import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { EthereumService } from '../ethereum/ethereum.service';
import R from 'ramda';

@Injectable()
export class EthHealthIndicator extends HealthIndicator {
  constructor(private ethService: EthereumService) {
    super();
  }
  
  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const { ether } = this.ethService;
    const blockNumber = await ether.getBlockNumber();
    const network = await ether.getNetwork();
    const isHealthy = !R.isNil(blockNumber);
    const result = this.getStatus(key, isHealthy, { blockNumber, network });

    if (isHealthy) {
      return result;
    }

    throw new HealthCheckError(
      'infura health check failed',
      'block number is null or undefined',
    );
  }
}
