import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('token-prices')
export class Token {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  symbol: string;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column('numeric')
  usd: number;

  @Column('varchar')
  name: string;
}
