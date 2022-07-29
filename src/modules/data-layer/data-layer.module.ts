import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoDatabaseModule } from 'src/modules/mongo-database/mongo-database.module';
import { Order } from '../orders/order.entity';
import { OrderSchema } from '../orders/schema/order.schema';
import { DataLayerService } from './data-layer.service';

@Module({
  providers: [DataLayerService],
  exports: [DataLayerService],
  imports: [
    MongoDatabaseModule,
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
  ],
})
export class DataLayerModule {}
