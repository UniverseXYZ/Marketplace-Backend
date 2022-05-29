import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

//aggregated tokens attributes from a collection
@Schema({ timestamps: true, collection: 'nft-collection-attributes' })
export class NFTCollectionAttributes {
  @Prop({ trim: true, required: true })
  public contractAddress: string;

  @Prop({ type: Object })
  public attributes: any;
}

export type NFTCollectionAttributesDocument = NFTCollectionAttributes &
  Document;

export const NFTCollectionAttributesrSchema = SchemaFactory.createForClass(
  NFTCollectionAttributes,
);

NFTCollectionAttributesrSchema.index({ contractAddress: 1 }, { unique: true });
