import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrderEncodersController } from './order-encoders.controller';
import { EthereumModule } from '../ethereum/ethereum.module';
import { OrdersInternalController } from './orders-internal.controller';
import { HttpModule } from '@nestjs/axios';
import { AppConfigModule } from '../configuration/configuration.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schema/order.schema';
import { NFTTokenOwner, NFTTokenOwnerSchema } from 'datascraper-schema';
import { OrdersService } from './mongo-orders.service';
import { DATA_LAYER_SERVICE } from '../data-layer/interfaces/IDataLayerInterface';
import { DataLayerService } from '../data-layer/daya-layer.service';

@Module({
  providers: [
    OrdersService,
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
    MongooseModule.forFeature([
      { name: NFTTokenOwner.name, schema: NFTTokenOwnerSchema },
    ]),
    EthereumModule,
    HttpModule,
    AppConfigModule,
  ],
})
export class OrdersModule {}
