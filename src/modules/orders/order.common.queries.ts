import { constants } from 'src/common/constants';
import { MarketplaceException } from 'src/common/exceptions/MarketplaceException';
import { SelectQueryBuilder } from 'typeorm';
import web3 from 'web3';
import { TOKENS } from '../coingecko/tokens';
import { addPriceSortQuery } from './order.query.helpers';
import { OrderSide, OrderStatus } from './order.types';

import './interfaces/order.common.queries';
import { FilterSide, NftType } from './interfaces/order.common.queries';

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
  return this.andWhere('LOWER(order.maker) = :maker', {
    maker: maker.toLowerCase(),
  });
};

SelectQueryBuilder.prototype.addTakerFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  taker: string,
): SelectQueryBuilder<Entity> {
  return this.andWhere('LOWER(order.taker) = :taker', {
    taker: taker.toLowerCase(),
  });
};

SelectQueryBuilder.prototype.addAssetClassFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  assetClass: string,
  filterSide: FilterSide = FilterSide.BOTH,
): SelectQueryBuilder<Entity> {
  const queryMake = `make->'assetType'->'assetClass' = ':assetClass'`;
  const queryTake = `take->'assetType'->'assetClass' = ':assetClass'`;
  const queryBoth = `((${queryMake}) OR (${queryTake}))`;
  let assetClassQuery = '';

  switch (filterSide) {
    case FilterSide.MAKE:
      assetClassQuery = queryMake;
      break;
    case FilterSide.TAKE:
      assetClassQuery = queryTake;
      break;
    case FilterSide.BOTH:
      assetClassQuery = queryBoth;
      break;
  }

  return this.andWhere(assetClassQuery, {
    assetClass,
  });
};

SelectQueryBuilder.prototype.addCollectionFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  collection: string,
  filterSide: FilterSide = FilterSide.BOTH,
  nftFilter: NftType = NftType.BOTH,
): SelectQueryBuilder<Entity> {
  const queryMake = `LOWER(make->'assetType'->>'contract') = :collection`;
  const queryMakeBundle = `LOWER(make->'assetType'->'contracts') ?| array[:collections]`;
  const queryTake = `LOWER(take->'assetType'->>'contract') = :collection`;
  const queryTakeBundle = `LOWER(take->'assetType'->'contracts') ?| array[:collections]`;

  const queryMakeBoth = `((${queryMake}) OR (${queryMakeBundle}))`;
  const queryTakeBoth = `((${queryTake}) OR (${queryTakeBundle}))`;
  const queryMakeTakeErc721 = `((${queryMake}) OR (${queryTake}))`;
  const queryMakeTakeBundle = `((${queryMakeBundle}) OR (${queryTakeBundle}))`;

  const queryMakeTakeAll = `((${queryMake}) OR (${queryTake}) OR (${queryMakeBundle}) OR (${queryTakeBundle}))`;

  let collectionQuery = '';

  switch (filterSide) {
    case FilterSide.MAKE:
      switch (nftFilter) {
        case NftType.ERC721:
          collectionQuery = queryMake;
          break;
        case NftType.ERCBUNDLE:
          collectionQuery = queryMakeBundle;
          break;
        case NftType.BOTH:
          collectionQuery = queryMakeBoth;
          break;
      }
      break;
    case FilterSide.TAKE:
      switch (nftFilter) {
        case NftType.ERC721:
          collectionQuery = queryTake;
          break;
        case NftType.ERCBUNDLE:
          collectionQuery = queryTakeBundle;
          break;
        case NftType.BOTH:
          collectionQuery = queryTakeBoth;
          break;
      }
      break;
    case FilterSide.BOTH:
      switch (nftFilter) {
        case NftType.ERC721:
          collectionQuery = queryMakeTakeErc721;
          break;
        case NftType.ERCBUNDLE:
          collectionQuery = queryMakeTakeBundle;
          break;
        case NftType.BOTH:
          collectionQuery = queryMakeTakeAll;
          break;
      }
      break;
  }
  return this.andWhere(collectionQuery, {
    collection: `"${collection.toLowerCase()}"`,
    collections: `${collection.toLowerCase()}`,
  });
};

SelectQueryBuilder.prototype.addTokenIdsFilter = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  tokenIds: string,
  filterSide: FilterSide = FilterSide.BOTH,
): SelectQueryBuilder<Entity> {
  // @TODO there is no filtering by tokenId for ERC721_BUNDLE orders supposedly because of array of arrays
  const queryMake = `make->'assetType'->>'tokenId' IN (:tokenIds)`;
  const queryTake = `take->'assetType'->>'tokenId' IN (:tokenIds)`;
  const queryForBoth = `((${queryMake}) OR (${queryTake}))`;
  let tokenIdsQuery = '';

  switch (filterSide) {
    case FilterSide.MAKE:
      tokenIdsQuery = queryMake;
      break;
    case FilterSide.TAKE:
      tokenIdsQuery = queryTake;
      break;
    case FilterSide.BOTH:
      tokenIdsQuery = queryForBoth;
      break;
    default:
      break;
  }
  return this.andWhere(tokenIdsQuery, {
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
  return this.orderBy(
    `(case when order.end - :endingSoon >= 0 then 1 else 2 end)`,
  ).setParameters({ endingSoon: endingSoonTimestamp });
};

SelectQueryBuilder.prototype.sortByHighestPrice = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  tokenAddresses: { [key in TOKENS]: string },
  tokenUsdValues: { [key in TOKENS]: number },
): SelectQueryBuilder<Entity> {
  const priceQuery = addPriceSortQuery(tokenAddresses, tokenUsdValues);
  return this.addSelect(priceQuery, 'usd_value').addOrderBy(
    'usd_value',
    'DESC',
  );
};

SelectQueryBuilder.prototype.sortByLowestPrice = function <Entity>(
  this: SelectQueryBuilder<Entity>,
  tokenAddresses: { [key in TOKENS]: string },
  tokenUsdValues: { [key in TOKENS]: number },
): SelectQueryBuilder<Entity> {
  const priceQuery = addPriceSortQuery(tokenAddresses, tokenUsdValues);
  return this.addSelect(priceQuery, 'usd_value').addOrderBy('usd_value', 'ASC');
};

SelectQueryBuilder.prototype.sortByRecentlyListed = function <Entity>(
  this: SelectQueryBuilder<Entity>,
): SelectQueryBuilder<Entity> {
  return this.addOrderBy('order.createdAt', 'DESC');
};
