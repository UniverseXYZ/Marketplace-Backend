import {
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { constants } from 'src/common/constants';

// export interface IBundleType {
//   assetClass: string;
//   contracts: string[];
//   tokenIds: number[][];
// }
export class BundleType {
  assetClass: string;
  contracts: string[];
  tokenIds: number[][];

  @Matches(constants.REGEX_JS_INSENSITIVE, {
    message: 'Forbidden characters.',
  })
  @IsOptional()
  @IsString()
  bundleName?: string;

  @Matches(constants.REGEX_JS_INSENSITIVE, {
    message: 'Forbidden characters.',
  })
  @IsOptional()
  @IsString()
  bundleDescription?: string;
}

export interface IAssetType {
  assetClass: string;
  contract?: string;
  tokenId?: number;
}

// export interface IAsset {
//   assetType: IAssetType | IBundleType;
//   value: string; // have to use string for token decimal
// }
export class Asset {
  @ValidateNested({ each: true })
  @Type(() => BundleType)
  assetType: IAssetType & BundleType;
  value: string; // have to use string for token decimal
}

export interface IPart {
  account: string;
  value: string;
}

export interface IOrderData {
  dataType?: string;
  revenueSplits?: IPart[];
}

export enum AssetClass {
  ETH = 'ETH',
  ERC20 = 'ERC20',
  ERC721 = 'ERC721',
  ERC721_BUNDLE = 'ERC721_BUNDLE',
  ERC1155 = 'ERC1155',
}

export const NftTokens = ['ERC721', 'ERC721_BUNDLE', 'ERC1155'];

export enum OrderStatus {
  CREATED,
  PARTIALFILLED,
  FILLED,
  CANCELLED,
  STALE,
}

export enum OrderSide {
  BUY,
  SELL,
}
