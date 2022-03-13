import { TOKENS } from 'src/modules/coingecko/tokens';
import { OrderSide, OrderStatus } from '../order.types';

export enum FilterSide {
  MAKE,
  TAKE,
  BOTH,
}

export enum NftType {
  ERC721,
  ERCBUNDLE,
  BOTH,
}

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

    addTakerFilter(
      this: SelectQueryBuilder<Entity>,
      taker: string,
    ): SelectQueryBuilder<Entity>;

    addAssetClassFilter(
      this: SelectQueryBuilder<Entity>,
      assetClass: string,
      filterSide: FilterSide,
    ): SelectQueryBuilder<Entity>;

    addCollectionFilter(
      this: SelectQueryBuilder<Entity>,
      collection: string,
      filterSide: FilterSide,
      nftType: NftType,
    ): SelectQueryBuilder<Entity>;

    addTokenIdsFilter(
      this: SelectQueryBuilder<Entity>,
      tokenIds: string,
      filterSide: FilterSide,
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
      tokenUsdValues: { [key in TOKENS]: number },
    ): SelectQueryBuilder<Entity>;

    sortByLowestPrice(
      this: SelectQueryBuilder<Entity>,
      tokenAddresses: { [key in TOKENS]: string },
      tokenUsdValues: { [key in TOKENS]: number },
    ): SelectQueryBuilder<Entity>;

    sortByRecentlyListed(
      this: SelectQueryBuilder<Entity>,
    ): SelectQueryBuilder<Entity>;
  }
}
