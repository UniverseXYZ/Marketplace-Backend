import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';
import { Order } from '../orders/order.entity';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

// TODO: Add all db entities
const entities = [Order];

@Injectable()
export class TypeOrmDefaultConfigService implements TypeOrmOptionsFactory {
  constructor(protected readonly config: AppConfig) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      autoLoadEntities: false,
      logging: false,
      namingStrategy: new SnakeNamingStrategy(),
      entities,
      database: this.config.values.DB_DATABASE_NAME,
      host: this.config.values.DB_HOST,
      port: this.config.values.DB_PORT,
      ssl: this.config.values.DB_SSL,
      synchronize: this.config.values.DB_SYNC,
      migrationsRun: this.config.values.DB_MIGRATIONS,
      username: this.config.values.DB_USERNAME,
      password: this.config.values.DB_PASSWORD,
    };
  }
}
