import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  // IAsset,
  Asset,
  IOrderData,
  OrderSide,
  OrderStatus,
} from './order.types';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column('integer')
  @Index({ unique: false })
  status: OrderStatus;

  @Column('varchar')
  @Index({ unique: true })
  hash: string;

  @Column('varchar')
  type: string;

  @Column('integer')
  side: OrderSide;

  @Column('varchar')
  @Index({ unique: false })
  maker: string;

  @Column('jsonb')
  @Index({ unique: false })
  // make: IAsset;
  make: Asset;

  @Column('varchar')
  taker: string;

  @Column('jsonb')
  take: Asset;

  @Column('numeric')
  salt: number;

  @Column('numeric')
  start: number;

  @Column('numeric')
  end: number;

  @Column('jsonb')
  data: IOrderData;

  @Column('varchar')
  signature: string;

  @Column('varchar')
  fill: string;

  @Column('varchar')
  makeStock: string;
  @Column('varchar')
  makeBalance: string;

  @Column('varchar', { nullable: true })
  cancelledTxHash?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  matchedTxHash?: any;

  @Column('varchar', {
    nullable: true,
  })
  erc1155TokenBalance?: string;

  // @Column()
  // makePriceUsd: number;
  // @Column()
  // takePriceUsd: number;
}
