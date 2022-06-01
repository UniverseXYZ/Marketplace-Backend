import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CreateOrderDto } from 'src/modules/orders/order.dto';
import { Order } from 'src/modules/orders/order.entity';
import { OrderDocument } from 'src/modules/orders/schema/order.schema';
import { Model } from 'mongoose';
import { IDataLayerService } from './interfaces/IDataLayerInterface';
import { OrderSide, OrderStatus } from 'src/modules/orders/order.types';

@Injectable()
export class DataLayerService implements IDataLayerService {
  private logger;

  constructor(
    @InjectModel(Order.name)
    private readonly ordersModel: Model<OrderDocument>,
  ) {
    this.logger = new Logger(DataLayerService.name);
  }

  public async createOrder(order: CreateOrderDto) {
    this.logger.log('Persisting new order in the database');

    const newOrder = await this.ordersModel.create(order);

    return newOrder;
  }

  public async findExistingActiveOrder(
    tokenId: string,
    contract: string,
    utcTimestamp: number,
  ) {
    return await this.ordersModel.findOne({
      side: OrderSide.SELL,
      status: OrderStatus.CREATED,
      make: {
        assetType: {
          tokenId: tokenId,
        },
        contract: contract.toLowerCase(),
      },
      $and: [
        {
          $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
        },
        { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
      ],
    });
  }

  /**
   * Returns the "salt" for a wallet address.
   * Salt equals the number of orders in the orders table for this wallet plus 1.
   * This method does not do walletAddress validation check.
   * @param walletAddress
   * @returns {Promise<number>}
   */
  public async getSaltByWalletAddress(walletAddress: string): Promise<number> {
    let value = 1;

    const count = await this.ordersModel.countDocuments({
      maker: walletAddress.toLowerCase(),
    });
    value = value + count;

    return value;
  }
}
