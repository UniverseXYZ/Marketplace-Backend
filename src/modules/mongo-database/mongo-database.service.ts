import { Injectable } from '@nestjs/common';
import {
  MongooseModuleOptions,
  MongooseOptionsFactory,
} from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import uniqueValidator from 'mongoose-unique-validator';
import { AppConfig } from '../configuration/configuration.service';

@Injectable()
export class MongoDatabaseService implements MongooseOptionsFactory {
  constructor(private configService: AppConfig) {}
  createMongooseOptions(): MongooseModuleOptions {
    const uri: string = this.configService.values.MONGODB_URI;
    if (!uri) {
      throw new Error('MongoDB URI is not defined');
    }

    return {
      uri,
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectionFactory: (connection: Connection) => {
        connection.plugin(uniqueValidator);
        return connection;
      },
    };
  }
}
