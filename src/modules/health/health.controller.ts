import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { BaseController } from '../../common/base.controller';
import { EthHealthIndicator } from '../eth-health/eth-health.service';

@Controller('health')
@ApiTags('Health')
export class HealthController extends BaseController {
  
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private eth: EthHealthIndicator,
  ) {
    super(HealthController.name);
  }

  @Get()
  @HealthCheck()
  async healthCheck() {
    try {
      return this.health.check([
        () => this.db.pingCheck('database'),
        () => this.eth.pingCheck('ethereum'),
      ]);
    } catch(e) {
      this.logger.error(e);
      this.errorResponse(e);
    }
  }
}
