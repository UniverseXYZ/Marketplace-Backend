import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'token-prices' })
export class TokenPrices {
  @Prop({ trim: true, required: true })
  symbol: string;

  @Prop({ trim: true, required: true })
  usd: number;

  @Prop({ trim: true, required: true })
  name: string;
}

type TokenPricesDocument = TokenPrices & Document;

const TokenPricesSchema = SchemaFactory.createForClass(TokenPrices);

export { TokenPricesDocument, TokenPricesSchema };
