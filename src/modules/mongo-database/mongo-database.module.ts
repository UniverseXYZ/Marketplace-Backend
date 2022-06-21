import { Module } from '@nestjs/common';
import { AppConfigModule } from '../configuration/configuration.module';
import { MongoDatabaseService } from './mongo-database.service';

@Module({
  imports: [AppConfigModule],
  providers: [MongoDatabaseService],
  exports: [MongoDatabaseService],
})
export class MongoDatabaseModule {}
