import {
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  ValidateNested,
  Matches,
  MaxLength,
  IsArray,
  ValidateIf,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import 'reflect-metadata'; // this import is for tests
import { constants } from '../../common/constants';

export enum AssetClass {
  ETH = 'ETH',
  ERC20 = 'ERC20',
  ERC721 = 'ERC721',
  ERC721_BUNDLE = 'ERC721_BUNDLE',
  ERC1155 = 'ERC1155',
}

export abstract class AbstractAssetType {
  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.assetClass !== AssetClass.ERC721_BUNDLE)
  contract?: string;

  @IsNumberString()
  @IsOptional()
  @ValidateIf((o) => o.assetClass !== AssetClass.ERC721_BUNDLE)
  tokenId?: string;

  @IsArray()
  @IsString({
    each: true,
  })
  @ValidateIf((o) => o.assetClass === AssetClass.ERC721_BUNDLE)
  contracts: string[];

  @IsArray()
  @ValidateIf((o) => o.assetClass === AssetClass.ERC721_BUNDLE)
  tokenIds: string[][];

  @Matches(constants.REGEX_JS_INSENSITIVE, {
    message: 'Forbidden characters.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ValidateIf((o) => o.assetClass === AssetClass.ERC721_BUNDLE)
  bundleName?: string;

  @Matches(constants.REGEX_JS_INSENSITIVE, {
    message: 'Forbidden characters.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @ValidateIf((o) => o.assetClass === AssetClass.ERC721_BUNDLE)
  bundleDescription?: string;
}

interface IBundleType {
  assetClass: string;
  contracts: string[];
  tokenIds: string[][];
}
export class BundleType implements IBundleType {
  @IsString()
  assetClass: string;

  @IsArray()
  @IsString({
    each: true,
  })
  contracts: string[];

  @IsArray()
  tokenIds: string[][];

  @Matches(constants.REGEX_JS_INSENSITIVE, {
    message: 'Forbidden characters.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bundleName?: string;

  @Matches(constants.REGEX_JS_INSENSITIVE, {
    message: 'Forbidden characters.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  bundleDescription?: string;
}

export interface IAssetType {
  assetClass: string;
  contract?: string;
  tokenId?: string;
}
export class AssetType implements IAssetType {
  @IsString()
  @IsNotEmpty()
  assetClass: string;

  @IsString()
  @IsOptional()
  contract?: string;

  @IsNumberString()
  @IsOptional()
  tokenId?: string;
}

export interface IAsset {
  assetType: IAssetType | IBundleType;
  value: string; // have to use string for token decimal
}
export class Asset implements IAsset {
  @ValidateNested({ each: true })
  @Type(() => AbstractAssetType)
  assetType: AbstractAssetType;

  @IsNumberString()
  value: string; // have to use string for token decimal
}

export interface IPart {
  account: string;
  value: string;
}
export class Part {
  @IsString()
  @Matches(constants.REGEX_ETHEREUM_ADDRESS, {
    message: constants.WALLET_ADDRESS_ERROR,
  })
  account: string;

  @IsNumberString()
  @IsNotEmpty()
  value: string;
}

export interface IOrderData {
  dataType?: string;
  revenueSplits?: IPart[];
}
export class OrderData {
  @IsString()
  @IsOptional()
  dataType?: string;

  @IsArray()
  @IsOptional()
  revenueSplits?: IPart[];
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
