import { Module } from '@nestjs/common';
import { AppConfigModule } from '../configuration/configuration.module';
import { EthereumService } from './ethereum.service';

@Module({
  imports: [AppConfigModule],
  providers: [EthereumService],
  exports: [EthereumService],
})
export class EthereumModule {}
