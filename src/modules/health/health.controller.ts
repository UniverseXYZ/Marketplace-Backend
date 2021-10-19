import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { EthHealthIndicator } from '../eth-health/eth-health.service';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private eth: EthHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  async health_check() {
    // TODO: check health
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.eth.pingCheck('ethereum'),
    ]);
  }
}
