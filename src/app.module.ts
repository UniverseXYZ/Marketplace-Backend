import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import configuration from './modules/configuration';
import { OrdersModule } from './modules/orders/orders.module';
import { CoingeckoModule } from './modules/coingecko/coingecko.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoDatabaseService } from './modules/mongo-database/mongo-database.service';
import { MongoDatabaseModule } from './modules/mongo-database/mongo-database.module';

@Module({
  imports: [
    TerminusModule,
    ConfigModule.forRoot({
      ignoreEnvFile: false,
      ignoreEnvVars: false,
      isGlobal: true,
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      imports: [MongoDatabaseModule],
      useExisting: MongoDatabaseService,
    }),
    HealthModule,
    OrdersModule,
    CoingeckoModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
