import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  UpdateDateColumn,
} from 'typeorm';

@Entity('token-prices')
export class Token {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  @Index({ unique: false })
  symbol: string;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column('numeric')
  @Index({ unique: true })
  usd: number;

  @Column('varchar')
  @Index({ unique: false })
  name: string;
}
