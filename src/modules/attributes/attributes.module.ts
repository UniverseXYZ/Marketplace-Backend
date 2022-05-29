import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttributesService } from './attributes.service';
import {
  NFTCollectionAttributes,
  NFTCollectionAttributesrSchema,
} from './schema/attributes.schema';

@Module({
  providers: [AttributesService],
  controllers: [],
  imports: [
    MongooseModule.forFeature([
      {
        name: NFTCollectionAttributes.name,
        schema: NFTCollectionAttributesrSchema,
      },
    ]),
  ],
})
export class AttributesModule {}
