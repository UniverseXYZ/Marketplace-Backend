import { ApiProperty } from '@nestjs/swagger';
import {
  IsBooleanString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  // IAsset,
  Asset,
  // IOrderData,
  OrderData,
  IPart,
  Part,
  AssetClass,
} from './order.types';
import { constants } from '../../common/constants';

export class OrderDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'UNIVERSE_V1',
    description: '',
    required: true,
  })
  type: string;

  @IsString()
  @Matches(constants.REGEX_ETHEREUM_ADDRESS, {
    message: constants.WALLET_ADDRESS_ERROR,
  })
  @ApiProperty({
    example: '0xE1d7a59AB392EA29b059dAE31c5A573e2fEcC5A8',
    description: 'The wallet address who is going to give asset',
    required: true,
  })
  maker: string;

  @ApiProperty({
    example: {
      assetType: {
        assetClass: 'ERC721',
        contract: '0x78c3E13fdDC49f89feEB54C3FC47d7df611FA9BE',
        tokenId: '6837465522200555559822',
        bundleName:
          'Optional. Max length 100. Bundle name for ERC721_BUNDLE orders.',
        bundleDescription:
          'Optional. Max length 1024. Bundle description for ERC721_BUNDLE orders.',
      },
      value: '1',
    },
    description: 'asset info you want to give out',
    required: true,
  })
  @ValidateNested({ each: true })
  @Type(() => Asset)
  make: Asset;

  @IsString()
  @ApiProperty({
    example: '0x0000000000000000000000000000000000000000',
    description: 'The wallet address who you want to take this asset',
    required: false,
  })
  taker?: string;

  @ApiProperty({
    example: {
      assetType: {
        assetClass: 'ETH',
      },
      value: '100000000000000000',
    },
    description: 'Asset Info you want to get back',
    required: true,
  })
  @ValidateNested({ each: true })
  @Type(() => Asset)
  take: Asset;

  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({
    example: 1,
    description: 'nonce for signatures submitted with the order',
    required: true,
  })
  salt: number;

  @IsNumber()
  @ApiProperty({
    example: 0,
    description: 'uint - order cannot be filled before this time',
    required: true,
  })
  start: number;

  @IsNumber()
  @ApiProperty({
    example: 0,
    description: 'uint - order cannot be filled after this time',
    required: true,
  })
  end: number;

  @ApiProperty({
    example: {
      dataType: 'ORDER_DATA',
      revenueSplits: [
        {
          account: '0x3bB0dE46c6B1501aF5921Fb7EDBc15dFD998Fadd',
          value: '5000',
        },
      ],
    },
    description: 'order data, for now only for the revenue splits',
    required: true,
  })
  @ValidateNested({ each: true })
  @Type(() => OrderData)
  data: OrderData;
}

export class CreateOrderDto extends OrderDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example:
      '0xad47f02925ffbd0bbc6a53846b0f499ca74ec8a176e4e1420eb1dcbb21d05a3d1e3f20957f2f7f8c99586e9ed92d2aeb2c85ea54afd39b49c4a1d20bd639d2e41c',
    description: 'signature of the order info',
    required: true,
  })
  signature: string;
}

export class PrepareTxDto {
  @IsString()
  @IsNotEmpty()
  @Matches(constants.REGEX_ETHEREUM_ADDRESS, {
    message: constants.WALLET_ADDRESS_ERROR,
  })
  @ApiProperty({
    example: '0x67b93857317462775666a310ac292D61dEE4bbb9',
    description: 'The wallet address who is going to give asset',
    required: true,
  })
  maker: string;

  @ApiProperty({
    example: '1',
    description: 'The amount you want to buy',
    required: true,
  })
  @IsNumberString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({
    example: [
      {
        account: '0x3bB0dE46c6B1501aF5921Fb7EDBc15dFD998Fadd',
        value: '5000',
      },
    ],
    description: 'Possible revenue splits',
    required: false,
  })
  @ValidateNested({ each: true })
  @Type(() => Part)
  revenueSplits?: Part[];
}

export class QueryDto {
  @ApiProperty({
    example: 1,
    description: 'The page of results',
    required: false,
  })
  @IsNumberString()
  @IsOptional()
  page?: number;

  @ApiProperty({
    example: 10,
    description: 'The amount of results shown in one page',
    required: false,
  })
  @IsNumberString()
  @IsOptional()
  limit?: number;

  @ApiProperty({
    example: '0xE1d7a59AB392EA29b059dAE31c5A573e2fEcC5A8',
    description: 'Who created this order',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Matches(constants.REGEX_ETHEREUM_ADDRESS, {
    message: 'Invalid maker.',
  })
  maker: string;

  @ApiProperty({
    example: 1,
    description: 'Order side. e.g. 0 for buy, 1 for sell',
    required: false,
  })
  @IsNumberString()
  @IsOptional()
  side: number;

  @ApiProperty({
    example: 'ERC721,ERC721_BUNDLE',
    description: 'Asset class of the order. e.g. ERC721, ERC721_BUNDLE',
    required: false,
  })
  @IsString()
  @IsOptional()
  assetClass: AssetClass;

  @ApiProperty({
    example: '0x78c3E13fdDC49f89feEB54C3FC47d7df611FA9BE',
    description: 'Asset address',
    required: false,
  })
  @IsOptional()
  @Matches(constants.REGEX_ETHEREUM_ADDRESS, {
    message: 'Invalid collection.',
  })
  collection: string;

  @ApiProperty({
    example: '1,2,3',
    description: 'Token ids of the NFTs',
    required: false,
  })
  @IsString()
  @IsOptional()
  tokenIds: string;

  @ApiProperty({
    example: 1645177895,
    description: 'Order timestamp',
    required: false,
  })
  @IsNumberString()
  @IsOptional()
  beforeTimestamp: number;

  @ApiProperty({
    example: 'USDC',
    description: 'ERC20 Token',
    required: false,
  })
  @IsString()
  @IsOptional()
  token: string;

  @ApiProperty({
    example: '0.2',
    description: 'Min price of the order',
    required: false,
  })
  @IsNumberString()
  @IsOptional()
  minPrice: string;

  @ApiProperty({
    example: '0.9',
    description: 'Max price of the order',
    required: false,
  })
  @IsNumberString()
  @IsOptional()
  maxPrice: string;

  @ApiProperty({
    example: '1',
    description: 'Sort key for the query (1,2,3,4)',
    required: false,
  })
  @IsNumberString()
  @IsOptional()
  sortBy: string;

  @ApiProperty({
    example: true,
    description: 'Order has offers',
    required: false,
  })
  @IsOptional()
  @IsBooleanString()
  hasOffers: boolean;
}

export class MatchOrder {
  txHash: string;

  leftMaker: string;
  rightMaker: string;
  leftOrderHash: string;
  rightOrderHash: string;
  newLeftFill: string;
  newRightFill: string;
  txFrom: string;
}
export class MatchOrderDto {
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MatchOrder)
  @ApiProperty({
    example: [
      {
        txHash:
          '0xf6768c7be3133edf019685bc230e2a4e58b505d159508e87cfcdac8e0e017b99',
        leftMaker: '0xf3d5a5d72b0c5c68e75ce70836f23a9337643098',
        rightMaker: '0x0ad21d5df91ec3f60086c08e07bd0f8cd95486a4',
        leftOrderHash:
          '0xb562669668f03d229620e0c46378266a6d8c252b32d00bbdfffb5b6b14fae903',
        rightOrderHash:
          '0xc25980c3b862b0221fcf62484ce805ec22a95a6e42c4aeb3e119ee08225cbd36',
        newLeftFill: '100000000000000000',
        newRightFill: '1',
        txFrom: '0x0ad21d5df91ec3f60086c08e07bd0f8cd95486a4',
      },
    ],
    description: 'Array of events to mark as matched.',
    required: true,
  })
  events: MatchOrder[];
}

export class CancelOrder {
  @ApiProperty({
    example:
      '0xf6768c7be3133edf019685bc230e2a4e58b505d159508e87cfcdac8e0e017b99',
    description: 'Cancel transaction hash.',
    required: true,
  })
  @IsString()
  txHash: string;

  @ApiProperty({
    example: '0xf3d5a5d72b0c5c68e75ce70836f23a9337643098',
    description: "Left order creator's wallet address.",
    required: true,
  })
  @IsString()
  leftMaker: string;

  @ApiProperty({
    example:
      '0xb562669668f03d229620e0c46378266a6d8c252b32d00bbdfffb5b6b14fae903.',
    description: 'Left order hash',
    required: true,
  })
  @IsString()
  leftOrderHash: string;
}
export class CancelOrderDto {
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CancelOrder)
  @ApiProperty({
    example: [
      {
        txHash:
          '0xf6768c7be3133edf019685bc230e2a4e58b505d159508e87cfcdac8e0e017b99',
        leftMaker: '0xf3d5a5d72b0c5c68e75ce70836f23a9337643098',
        leftOrderHash:
          '0xb562669668f03d229620e0c46378266a6d8c252b32d00bbdfffb5b6b14fae903',
      },
    ],
    description: 'Array of events to cancel.',
    required: true,
  })
  events: CancelOrder[];
}

export class TrackOrderDto {
  blockNum: string;
  hash: string;
  fromAddress: string;
  toAddress: string;
  value: string;
  erc721TokenId: string;
  erc1155Metadata: Array<any>;
  asset: string;
  category: string;
  address: string;
}

export class GetSaltParamsDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: '0xE1d7a59AB392EA29b059dAE31c5A573e2fEcC5A8',
    description: 'Wallet address',
    required: true,
  })
  @Matches(constants.REGEX_ETHEREUM_ADDRESS, {
    message: constants.WALLET_ADDRESS_ERROR,
  })
  walletAddress: string;
}
