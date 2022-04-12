import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  Asset,
  IOrderData,
  OrderData,
  OrderSide,
  OrderStatus,
} from '../order.types';

@Schema({ timestamps: true, collection: 'marketplace-orders' })
export class Order {
  @Prop({ trim: true, required: true, enum: OrderStatus })
  status: number;

  @Prop({ trim: true })
  hash: string;

  @Prop({ trim: true })
  type: string;

  @Prop({ trim: true, required: true, enum: OrderSide })
  side: number;

  @Prop({ trim: true, required: true })
  maker: string;

  @Prop({ type: Asset, trim: true, required: true })
  make: Asset;

  @Prop({ trim: true, required: true })
  taker: string;

  @Prop({ trim: true, required: true })
  take: Asset;

  @Prop({ trim: true, required: true })
  salt: number;

  @Prop({ trim: true, required: true })
  start: number;

  @Prop({ trim: true, required: true })
  end: number;

  @Prop({ type: OrderData, trim: true, required: true })
  data: OrderData;

  @Prop({ trim: true, required: true })
  signature: string;

  @Prop({ trim: true })
  fill: string;

  @Prop({ trim: true })
  makeStock: string;

  @Prop({ trim: true })
  makeBalance: string;

  @Prop({ trim: true })
  cancelledTxHash: string;

  @Prop({ trim: true })
  matchedTxHash: string;
}

type OrderDocument = Order & Document;

const OrderSchema = SchemaFactory.createForClass(Order);

export { OrderDocument, OrderSchema };
