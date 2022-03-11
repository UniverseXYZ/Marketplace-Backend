import { constants } from 'src/common/constants';
import { MarketplaceException } from 'src/common/exceptions/MarketplaceException';
import { QueryBuilder, SelectQueryBuilder, Repository } from 'typeorm';
import web3 from 'web3';
import { TOKENS } from '../coingecko/tokens';
import { Order } from './order.entity';
import { addPriceSortQuery } from './order.query.helpers';
import { OrderSide, OrderStatus } from './order.types';

//Declaration Merging Of Module.
declare module 'typeorm/query-builder/SelectQueryBuilder' {
  interface SelectQueryBuilder<Entity> {
    addStatusFilter(
      this: SelectQueryBuilder<Entity>,
      status: OrderStatus,
    ): SelectQueryBuilder<Entity>;

    addSideFilter(
      this: SelectQueryBuilder<Entity>,
      side: OrderSide,
    ): SelectQueryBuilder<Entity>;

    addStartFilter(
      this: SelectQueryBuilder<Entity>,
      start: number,
    ): SelectQueryBuilder<Entity>;

    addEndFilter(
      this: SelectQueryBuilder<Entity>,
      end: number,
    ): SelectQueryBuilder<Entity>;

    addMakerFilter(
      this: SelectQueryBuilder<Entity>,
      maker: string,
    ): SelectQueryBuilder<Entity>;

    addAssetClassFilter(
      this: SelectQueryBuilder<Entity>,
      assetClass: string,
    ): SelectQueryBuilder<Entity>;

    addCollectionFilter(
      this: SelectQueryBuilder<Entity>,
      collection: string,
    ): SelectQueryBuilder<Entity>;

    addTokenIdsFilter(
      this: SelectQueryBuilder<Entity>,
      tokenIds: string,
    ): SelectQueryBuilder<Entity>;

    addBeforeTimestampFilter(
      this: SelectQueryBuilder<Entity>,
      timestamp: number,
    ): SelectQueryBuilder<Entity>;

    addErc20TokenFilter(
      this: SelectQueryBuilder<Entity>,
      token: string,
    ): SelectQueryBuilder<Entity>;

    addMinPriceFilter(
      this: SelectQueryBuilder<Entity>,
      price: string,
    ): SelectQueryBuilder<Entity>;

    addMaxPriceFilter(
      this: SelectQueryBuilder<Entity>,
      price: string,
    ): SelectQueryBuilder<Entity>;

    sortByEndingSoon(
      this: SelectQueryBuilder<Entity>,
      endingSoonTimestamp: number,
    ): SelectQueryBuilder<Entity>;

    sortByHighestPrice(
      this: SelectQueryBuilder<Entity>,
      tokenAddresses: { [key in TOKENS]: string },
      tokenUsdValues:{ [key in TOKENS]: number }   
    ): SelectQueryBuilder<Entity>;

    sortByLowestPrice(
      this: SelectQueryBuilder<Entity>,
      tokenAddresses: { [key in TOKENS]: string },
      tokenUsdValues:{ [key in TOKENS]: number }   
    ): SelectQueryBuilder<Entity>;

    sortByRecentlyListed(
      this: SelectQueryBuilder<Entity>,
    ): SelectQueryBuilder<Entity>;

  }
}

SelectQueryBuilder.prototype.addStatusFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  status: OrderStatus,
): SelectQueryBuilder<Entity> {
  return this.andWhere('status = :status', { status });
};

SelectQueryBuilder.prototype.addSideFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  side: OrderSide,
): SelectQueryBuilder<Entity> {
  if (side !== OrderSide.BUY && side !== OrderSide.SELL) {
    throw new MarketplaceException(constants.INVALID_ORDER_SIDE);
  }

  return this.andWhere('order.side = :side', { side });
};

SelectQueryBuilder.prototype.addStartFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  start: number,
): SelectQueryBuilder<Entity> {
  return this.andWhere('(order.start = 0 OR order.start < :start)', {
    start,
  });
};

SelectQueryBuilder.prototype.addEndFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  end: number,
): SelectQueryBuilder<Entity> {
  return this.andWhere('(order.end = 0 OR :end < order.end )', { end });
};

SelectQueryBuilder.prototype.addMakerFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  maker: string,
): SelectQueryBuilder<Entity> {
  return this.andWhere('LOWER(maker) = :maker', {
    maker: maker.toLowerCase(),
  });
};

SelectQueryBuilder.prototype.addMakerFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  assetClass: string,
): SelectQueryBuilder<Entity> {
  const queryMake = `make->'assetType'->'assetClass' = ':assetClass'`;
  const queryTake = `take->'assetType'->'assetClass' = ':assetClass'`;
  const queryForBoth = `((${queryMake}) OR (${queryTake}))`;
  return this.andWhere(queryForBoth, {
    assetClass,
  });
};

SelectQueryBuilder.prototype.addCollectionFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  collection: string,
): SelectQueryBuilder<Entity> {
  const queryMake = `make->'assetType'->'contract' = :collection`;
  const queryMakeBundle = `make->'assetType'->'contracts' ?| array[:collections]`;
  const queryTake = `take->'assetType'->'contract' = :collection`;
  const queryTakeBundle = `take->'assetType'->'contracts' ?| array[:collections]`;
  const queryForBoth = `((${queryMake}) OR (${queryTake}) OR (${queryMakeBundle}) OR (${queryTakeBundle}))`;
  return this.andWhere(queryForBoth, {
    collection: `"${collection}"`,
    collections: `${collection}`,
  });
};

SelectQueryBuilder.prototype.addTokenIdsFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  tokenIds: string,
): SelectQueryBuilder<Entity> {
  // @TODO there is no filtering by tokenId for ERC721_BUNDLE orders supposedly because of array of arrays
  const queryMake = `make->'assetType'->>'tokenId' IN (:tokenIds)`;
  const queryTake = `take->'assetType'->>'tokenId' IN (:tokenIds)`;
  const queryForBoth = `((${queryMake}) OR (${queryTake}))`;
  return this.andWhere(queryForBoth, {
    tokenIds: tokenIds.replace(/\s/g, '').split(','),
  });
};

SelectQueryBuilder.prototype.addBeforeTimestampFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  timestamp: number,
): SelectQueryBuilder<Entity> {
  const milisecTimestamp = Number(timestamp) * 1000;
  const utcDate = new Date(milisecTimestamp);

  const timestampQuery = `order.createdAt >= :date`;
  return this.andWhere(timestampQuery, {
    date: utcDate.toDateString(),
  });
};

SelectQueryBuilder.prototype.addErc20TokenFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  token: string,
): SelectQueryBuilder<Entity> {
  let queryTake = '';

  if (token === constants.ZERO_ADDRESS) {
    queryTake = `take->'assetType'->>'assetClass' = 'ETH'`;
  } else {
    queryTake = `LOWER(take->'assetType'->>'contract') = :token`;
  }

  return this.andWhere(queryTake, {
    token: token.toLowerCase(),
  });
};

SelectQueryBuilder.prototype.addMinPriceFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  price: string,
): SelectQueryBuilder<Entity> {
  const weiPrice = web3.utils.toWei(price);

  const queryTake = `CAST(take->>'value' as DECIMAL) >= CAST(:minPrice as DECIMAL)`;

  return this.andWhere(queryTake, {
    minPrice: weiPrice,
  });
};

SelectQueryBuilder.prototype.addMaxPriceFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  price: string,
): SelectQueryBuilder<Entity> {
  const weiPrice = web3.utils.toWei(price);

  const queryTake = `CAST(take->>'value' as DECIMAL) <= CAST(:maxPrice as DECIMAL)`;

  return this.andWhere(queryTake, {
    maxPrice: weiPrice,
  });
};

SelectQueryBuilder.prototype.sortByEndingSoon = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  endingSoonTimestamp: number,
): SelectQueryBuilder<Entity> {
  return this
  .orderBy(`(case when order.end - :endingSoon >= 0 then 1 else 2 end)`)
  .setParameters({ endingSoon: endingSoonTimestamp });

};

SelectQueryBuilder.prototype.sortByHighestPrice = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  tokenAddresses: { [key in TOKENS]: string },
  tokenUsdValues:{ [key in TOKENS]: number }   
): SelectQueryBuilder<Entity> {
  const priceQuery = addPriceSortQuery(tokenAddresses, tokenUsdValues)
  return this.addSelect(priceQuery, 'usd_value')
  .addOrderBy('usd_value', 'DESC');

};


SelectQueryBuilder.prototype.sortByLowestPrice = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  tokenAddresses: { [key in TOKENS]: string },
  tokenUsdValues:{ [key in TOKENS]: number }
): SelectQueryBuilder<Entity> {
  const priceQuery = addPriceSortQuery(tokenAddresses, tokenUsdValues)
  return this.addSelect(priceQuery, 'usd_value')
  .addOrderBy('usd_value', 'ASC');

};


SelectQueryBuilder.prototype.sortByRecentlyListed = function <Entity>(
  this: SelectQueryBuilder<Entity>,
): SelectQueryBuilder<Entity> {
  return this.addOrderBy('order.createdAt', 'DESC');
};







