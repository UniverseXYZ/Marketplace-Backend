import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NFTCollectionAttributes,
  NFTCollectionAttributesDocument,
} from 'datascraper-schema';

@Injectable()
export class AttributesService {
  constructor(
    @InjectModel(NFTCollectionAttributes.name)
    readonly nftCollectionAttributesModel: Model<NFTCollectionAttributesDocument>,
  ) {}

  public async getTokenIdsByAttributes(
    collection: string,
    traits: Record<string, string>,
  ): Promise<any> {
    const allTraitsArray = [];

    for (const trait in traits) {
      traits[trait].split(',').forEach((type) => {
        const field = `$attributes.${trait}.${type}`;
        allTraitsArray.push(field);
      });
    }

    const tokenIds = await this.nftCollectionAttributesModel.aggregate([
      { $match: { contractAddress: collection } },
      {
        $project: {
          tokens: {
            $concatArrays: allTraitsArray,
          },
        },
      },
      {
        $group: {
          _id: null,
          tokens: { $addToSet: '$tokens' },
        },
      },
      { $unwind: '$tokens' },
      { $unset: '_id' },
    ]);

    return tokenIds;
  }
}
