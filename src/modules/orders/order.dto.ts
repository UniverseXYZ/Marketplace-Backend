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
        tokenId: 6,
      },
      value: '1',
    },
    description: 'asset info you want to give out',
    required: true,
  })
  @ValidateNested()
  make: IAsset;

  @IsString()
  @ApiProperty({
    example: '0x0000000000000000000000000000000000000000',
    description: 'The wallet address who you want to take this asset',
    required: false,
  })
  taker?: string;

  @ValidateNested()
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
  take: IAsset;

  @IsNumber()
  @ApiProperty({
    example: 1,
    description: 'nonce for signatures submitted with the order',
    required: false,
  })
  salt?: number;

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
  @ValidateNested()
  data: IOrderData;

  @ApiProperty({
    example:
      '0xad47f02925ffbd0bbc6a53846b0f499ca74ec8a176e4e1420eb1dcbb21d05a3d1e3f20957f2f7f8c99586e9ed92d2aeb2c85ea54afd39b49c4a1d20bd639d2e41c',
    description: 'signature of the order info',
    required: false,
  })
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

  @ApiProperty({
    example: '1',
    description: 'The amount you want to buy',
    required: true,
  })
  @IsString()
  amount: string;

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
    description: 'Possible revenue splits',
    required: false,
  })
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
    example: 'ERC721_BUNDLE',
    description: 'Asset class of the order. e.g. ERC721, ERC721_BUNDLE',
    required: false,
  })
  @IsString()
  @IsOptional()
  assetClass: string;

  @ApiProperty({
    example: '0x78c3E13fdDC49f89feEB54C3FC47d7df611FA9BE',
    description: 'Asset address',
    required: false,
  })
  @IsString()
  @IsOptional()
  collection: string;

  @ApiProperty({
    example: 1,
    description: 'Token id of the NFT',
    required: false,
  })
  @IsNumberString()
  @IsOptional()
  tokenId: number;
}

export class CancelOrderDto {
  blockNum: string;
  hash: string;
  fromAddress: string;
  toAddress: string;
  value: string;
  erc721TokenId: string;
  erc1155Metadata: string;
  asset: string;
  category: string;
  address: string;
}
