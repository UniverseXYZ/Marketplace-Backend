import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import R from 'ramda';
import {
  encodeAssetClass,
  encodeAssetData,
  encodeOrderData,
  hashOrderKey,
} from '../../utils/order-encoder';
import { In, Repository } from 'typeorm';
import { AppConfig } from '../configuration/configuration.service';
import { MatchOrderDto, OrderDto, PrepareTxDto, QueryDto } from './order.dto';
import { Order } from './order.entity';
import {
  OrderSide,
  OrderStatus,
  NftTokens,
  IBundleType,
  IAssetType,
} from './order.types';

const ZERO = '0x0000000000000000000000000000000000000000';
const DATA_TYPE_0x = '0x';
const DATA_TYPE = 'ORDER_DATA';

@Injectable()
export class OrdersService {
  private watchdog_url;
  constructor(
    private readonly appConfig: AppConfig,
    private readonly httpService: HttpService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {
    const watchdog_url = R.path(['WATCHDOG_URL'], appConfig.values);
    if (R.isNil(watchdog_url)) {
      throw new Error('Watchdog endpoint is missing');
    }
    this.watchdog_url = watchdog_url;
  }

  public convertToOrder(orderDto: OrderDto) {
    const order = this.orderRepository.create({
      type: orderDto.type,
      maker: orderDto.maker.toLowerCase(),
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
      order.maker.toLowerCase(),
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
      maker: prepareDto.maker.toLowerCase(),
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
      maker: order.maker.toLowerCase(),
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
      queryBuilder.andWhere('maker = :maker', { maker: query.maker.toLowerCase() });
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

    queryBuilder.andWhere('maker = :maker', { maker: maker.toLowerCase() });

    const queryMake = `make->'assetType'->'contract' = :collection`;
    const queryMakeBundle = `make->'assetType'->'contracts' ?| array[:collections]`;
    const queryForBoth = `((${queryMake}) OR (${queryMakeBundle}))`;
    queryBuilder.andWhere(queryForBoth, {
      collection: `"${contract}"`,
      collections: `${contract}`,
    });

    // const queryMakeTokenId = `make->'assetType'->'tokenId' = :tokenId`;
    // queryBuilder.andWhere(queryMakeTokenId, {
    //   tokenId: `${tokenId}`,
    // });

    const results = await queryBuilder.getMany();

    if (results.length <= 0) {
      return null;
    }

    for (const order of results) {
      if (order.make.assetType.assetClass === 'ERC721_BUNDLE') {
        // in case of bundle

        // 1. check collection index
        // 2. find token ids array and check if tokenId is in the array

        const assetType = order.make.assetType as IBundleType;
        const collectionIndex = assetType.contracts.indexOf(contract);
        const tokenIdArray = assetType.tokenIds[collectionIndex];
        if (tokenIdArray.includes(tokenId)) {
          return order;
        }
      } else {
        const assetType = order.make.assetType as IAssetType;
        // in case of ERC721
        if (assetType.tokenId === tokenId) {
          return order;
        }
      }
    }
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
    // if (order.status !== OrderStatus.CREATED) {
    //   console.log(
    //     `The matched order is not in CREATED status. Order left hash: ${event.leftOrderHash}`,
    //   );
    //   return;
    // }
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

  public async checkSubscribe(order: Order) {
    // if it is already subscribed, that's ok.
    this.httpService
      .post(`${this.watchdog_url}/v1/subscribe`, {
        addresses: [order.maker.toLowerCase()],
        topic: 'NFT',
      })
      .subscribe({
        next: (v) => console.log(v),
        error: (e) => console.error(e),
        complete: () => console.info('complete'),
      });
  }

  public async checkUnsubscribe(order: Order) {
    // if we are still interested in this address, don't unsubscribe
    const pending_orders = await this.orderRepository.find({
      where: {
        hash: order.hash,
        status: In([OrderStatus.CREATED, OrderStatus.PARTIALFILLED]),
      },
      take: 2,
    });
    if (pending_orders.length === 0) {
      this.httpService
        .post(`${this.watchdog_url}/unsubscribe/`, {
          addresses: [order.maker.toLowerCase()],
          topic: 'NFT',
        })
        .subscribe({
          next: (v) => console.log(v),
          error: (e) => console.error(e),
          complete: () => console.info('complete'),
        });
    }
  }

  /**
   * Returns the "salt" for a wallet address.
   * Salt equals the number of orders in the orders table for this wallet plus 1.
   * This method does not do walletAddress validation check.
   * @param walletAddress 
   * @returns {Object} {salt: Number}
   */
  public async getSaltByWalletAddress(walletAddress: string): Promise<Object> {
    
    const count = await this.orderRepository.count({
      maker: walletAddress.toLowerCase(),
    });
    const salt = 1 + count;
  
    return {
      salt: salt,
    };
  }
}
