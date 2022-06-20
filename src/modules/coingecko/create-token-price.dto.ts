import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateTokenPriceDTO {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'ETH',
    description: 'token symbol',
    required: true,
  })
  symbol: string;

  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({
    example: 1,
    description: 'token price',
    required: true,
  })
  usd: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'ETH',
    description: 'token name',
    required: true,
  })
  name: string;
}
