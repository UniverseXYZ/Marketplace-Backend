import { Module } from '@nestjs/common';
// import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order as PostgresOrder } from './order.entity';
import { OrderEncodersController } from './order-encoders.controller';
import { EthereumModule } from '../ethereum/ethereum.module';
import { OrdersInternalController } from './orders-internal.controller';
import { HttpModule } from '@nestjs/axios';
import { AppConfigModule } from '../configuration/configuration.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schema/order.schema';
import { OrdersService as MongoOrdersService } from './mongo-orders.service';
import { OrdersService } from './orders.service';
import { DataLayerModule } from 'src/modules/data-layer/data-layer.module';
import { DATA_LAYER_SERVICE } from '../data-layer/interfaces/IDataLayerInterface';
import { DataLayerService } from '../data-layer/daya-layer.service';

@Module({
  providers: [
    OrdersService,
    MongoOrdersService,
    {
      useClass: DataLayerService,
      provide: DATA_LAYER_SERVICE,
    },
  ],
  controllers: [
    OrdersController,
    OrderEncodersController,
    OrdersInternalController,
  ],
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    TypeOrmModule.forFeature([PostgresOrder]),
    EthereumModule,
    HttpModule,
    AppConfigModule,
  ],
})
export class OrdersModule {}
