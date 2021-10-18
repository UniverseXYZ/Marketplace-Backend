import { Test, TestingModule } from '@nestjs/testing';
import { EthHealthIndicator } from './eth-health.service';

describe('EthHealthService', () => {
  let service: EthHealthIndicator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EthHealthIndicator],
    }).compile();

    service = module.get<EthHealthIndicator>(EthHealthIndicator);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
