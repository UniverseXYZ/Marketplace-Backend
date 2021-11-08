import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { IAsset, IOrderData, IPart } from './order.types';

// TODO: more defence code for DTO. e.g. assetType
export class OrderDto {
  @IsString()
  @ApiProperty({
    example: 'UNIVERSE_V1',
    description: '',
    required: true,
  })
  type: string;

  @IsString()
  @ApiProperty({
    example: '0x67b93857317462775666a310ac292D61dEE4bbb9',
    description: 'The wallet address who is going to give asset',
    required: true,
  })
  maker: string;

  @ApiProperty({
    example: '',
    description: 'asset info you want to give out',
    required: true,
  })
  @ValidateNested()
  make: IAsset;

  @IsString()
  @ApiProperty({
    example: '0x67b93857317462775666a310ac292D61dEE4bbb9',
    description: 'The wallet address who you want to take this asset',
    required: false,
  })
  taker?: string;

  @ValidateNested()
  @ApiProperty({
    example: '',
    description: 'Asset Info you want to get back',
    required: true,
  })
  take: IAsset;

  @IsNumber()
  @ApiProperty({
    example: '',
    description: 'nonce for signatures submitted with the order',
    required: false,
  })
  salt?: number;

  @IsNumber()
  @ApiProperty({
    example: '0',
    description: 'uint - order cannot be filled before this time',
    required: true,
  })
  start: number;

  @IsNumber()
  @ApiProperty({
    example: '0',
    description: 'uint - order cannot be filled after this time',
    required: true,
  })
  end: number;

  @ApiProperty({
    example: '',
    description: '',
    required: true,
  })
  @ValidateNested()
  data: IOrderData;

  @ApiProperty({})
  signature: string;
}

export class PrepareTxDto {
  @IsString()
  @ApiProperty({
    example: '0x67b93857317462775666a310ac292D61dEE4bbb9',
    description: 'The wallet address who is going to give asset',
    required: true,
  })
  maker: string;

  @IsString()
  amount: string;

  revenueSplits?: IPart[];
}

export class MatchOrderDto {
  txHash: string;

  leftMaker: string;
  rightMaker: string;
  leftOrderHash: string;
  rightOrderHash: string;
  newLeftFill: string;
  newRightFill: string;
}

export class QueryDto {
  @ApiProperty()
  @IsNumberString()
  @IsOptional()
  page: number;

  @ApiProperty()
  @IsNumberString()
  @IsOptional()
  limit: number;

  @IsString()
  @IsOptional()
  maker: string;

  @IsNumberString()
  @IsOptional()
  side: number;

  @IsString()
  @IsOptional()
  assetClass: string;

  @IsString()
  @IsOptional()
  collection: string;

  @IsNumberString()
  @IsOptional()
  tokenId: number;
}
