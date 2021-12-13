import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  encodeAssetClass,
  encodeAssetData,
  encodeOrderData,
  hashOrderKey,
} from 'src/utils/order-encoder';
import { Repository } from 'typeorm';
import { MatchOrderDto, OrderDto, PrepareTxDto, QueryDto } from './order.dto';
import { Order } from './order.entity';
import { OrderSide, OrderStatus, NftTokens } from './order.types';

const ZERO = '0x0000000000000000000000000000000000000000';
const DATA_TYPE_0x = '0x';
const DATA_TYPE = 'ORDER_DATA';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  public convertToOrder(orderDto: OrderDto) {
    const order = this.orderRepository.create({
      type: orderDto.type,
      maker: orderDto.maker,
      taker: orderDto.taker,
      make: orderDto.make,
      take: orderDto.take,
      salt: orderDto.salt,
      start: orderDto.start,
      end: orderDto.end,
      data: orderDto.data,
      signature: orderDto.signature,
      fill: '0',
      makeBalance: orderDto.make.value,
      makeStock: orderDto.make.value,
      status: OrderStatus.CREATED,
    });
    order.hash = hashOrderKey(
      order.maker,
      order.make.assetType,
      order.take.assetType,
      order.salt,
    );
    if (NftTokens.includes(order.make.assetType.assetClass)) {
      order.side = OrderSide.SELL;
    } else if (NftTokens.includes(order.take.assetType.assetClass)) {
      order.side = OrderSide.BUY;
    }
    return order;
  }

  public convertToRightOrder(prepareDto: PrepareTxDto, leftOrder: Order) {
    const rightOrder = this.orderRepository.create({
      type: leftOrder.type,
      maker: prepareDto.maker,
      taker: ZERO,
      make: leftOrder.take,
      take: leftOrder.make,
      salt: leftOrder.salt,
      start: leftOrder.start,
      end: leftOrder.end,
      data: {
        dataType: prepareDto.revenueSplits?.length ? DATA_TYPE : DATA_TYPE_0x,
        revenueSplits: prepareDto.revenueSplits,
      },
    });
    return rightOrder;
  }

  public async saveOrder(order: Order) {
    return await this.orderRepository.save(order);
  }

  // Encode Order and ready to sign
  public encode(order: Order) {
    return {
      maker: order.maker,
      makeAsset: {
        assetType: {
          assetClass: encodeAssetClass(order.make.assetType.assetClass),
          data: encodeAssetData(order.make.assetType),
        },
        value: order.make.value,
      },
      taker: order.taker,
      takeAsset: {
        assetType: {
          assetClass: encodeAssetClass(order.take.assetType.assetClass),
          data: encodeAssetData(order.take.assetType),
        },
        value: order.take.value,
      },
      salt: order.salt,
      start: order.start,
      end: order.end,
      dataType: encodeAssetClass(order.data?.dataType),
      data: encodeOrderData(order.data?.revenueSplits),
    };
  }

  public async getOrderByHash(hash: string) {
    const order = await this.orderRepository.findOne({ hash });
    return order;
  }

  public async queryAll(query: QueryDto) {
    const skippedItems = (query.page - 1) * query.limit;

    const queryBuilder = this.orderRepository.createQueryBuilder();
    queryBuilder.where('status = :status', { status: OrderStatus.CREATED });

    if (query.side) {
      queryBuilder.andWhere('side = :side', { side: query.side });
    }

    if (query.maker) {
      queryBuilder.andWhere('maker = :maker', { maker: query.maker });
    }

    if (query.assetClass) {
      const queryMake = `make->'assetType'->'assetClass' = :assetClass`;
      const queryTake = `take->'assetType'->'assetClass' = :assetClass`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}))`;
      queryBuilder.andWhere(queryForBoth, {
        assetClass: `"${query.assetClass}"`,
      });
    }

    if (query.collection) {
      const queryMake = `make->'assetType'->'contract' = :collection`;
      const queryMakeBundle = `make->'assetType'->'contracts' ?| array[:collections]`;
      const queryTake = `take->'assetType'->'contract' = :collection`;
      const queryTakeBundle = `take->'assetType'->'contracts' ?| array[:collections]`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}) OR (${queryMakeBundle}) OR (${queryTakeBundle}))`;
      queryBuilder.andWhere(queryForBoth, {
        collection: `"${query.collection}"`,
        collections: `${query.collection}`,
      });
    }

    if (query.tokenId) {
      const queryMake = `make->'assetType'->'tokenId' = :tokenId`;
      const queryTake = `take->'assetType'->'tokenId' = :tokenId`;
      const queryForBoth = `((${queryMake}) OR (${queryTake}))`;
      queryBuilder.andWhere(queryForBoth, {
        tokenId: `${query.tokenId}`,
      });
    }

    return await queryBuilder
      .offset(skippedItems)
      .limit(query.limit)
      .getManyAndCount();
  }

  /**
   * used to find the order which
   * @param contract nft token address
   * @param tokenId nft token tokenId
   * @param maker wallet address who is transfer the token out
   * @returns order
   */
  public async queryOne(contract: string, tokenId: number, maker: string) {
    const queryBuilder = this.orderRepository.createQueryBuilder();
    queryBuilder.where('status = :status', { status: OrderStatus.CREATED });

    queryBuilder.andWhere('side = :side', { side: OrderSide.SELL });

    queryBuilder.andWhere('maker = :maker', { maker: maker });

    const queryMake = `make->'assetType'->'contract' = :collection`;
    const queryMakeBundle = `make->'assetType'->'contracts' ?| array[:collections]`;
    const queryForBoth = `((${queryMake}) OR (${queryMakeBundle}))`;
    queryBuilder.andWhere(queryForBoth, {
      collection: `"${contract}"`,
      collections: `${contract}`,
    });

    const queryMakeTokenId = `make->'assetType'->'tokenId' = :tokenId`;
    queryBuilder.andWhere(queryMakeTokenId, {
      tokenId: `${tokenId}`,
    });

    return await queryBuilder.getOne();
  }

  public async matchOrder(event: MatchOrderDto) {
    const order = await this.orderRepository.findOne({
      hash: event.leftOrderHash,
    });
    // TODO: refactor to use logger
    if (!order) {
      console.log(
        `The matched order is not found in database. Order left hash: ${event.leftOrderHash}`,
      );
      return;
    }
    if (order.status !== OrderStatus.CREATED) {
      console.log(
        `The matched order is not in CREATED status. Order left hash: ${event.leftOrderHash}`,
      );
      return;
    }
    order.status = OrderStatus.FILLED;
    order.matchedTxHash = event.txHash;
    await this.orderRepository.save(order);
  }

  public async cancelOrder(orderHash: string) {
    await this.orderRepository.update(
      { hash: orderHash },
      { status: OrderStatus.STALE },
    );
  }
}
