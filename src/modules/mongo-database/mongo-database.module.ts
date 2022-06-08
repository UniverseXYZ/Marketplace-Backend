import { Module } from '@nestjs/common';
import { MongoDatabaseService } from './mongo-database.service';

@Module({
  providers: [MongoDatabaseService],
  exports: [MongoDatabaseService],
})
export class MongoDatabaseModule {}
