import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrderEncodersController } from './order-encoders.controller';
import { EthereumModule } from '../ethereum/ethereum.module';
import { OrdersInternalController } from './orders-internal.controller';

@Module({
  providers: [OrdersService],
  controllers: [
    OrdersController,
    OrderEncodersController,
    OrdersInternalController,
  ],
  imports: [TypeOrmModule.forFeature([Order]), EthereumModule],
})
export class OrdersModule {}
