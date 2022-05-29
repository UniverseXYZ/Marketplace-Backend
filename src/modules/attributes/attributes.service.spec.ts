import { Test } from '@nestjs/testing';
import { AttributesService } from './attributes.service';
import { getModelToken } from '@nestjs/mongoose';
import {
  NFTCollectionAttributes,
  NFTCollectionAttributesDocument,
} from 'datascraper-schema';
import { Model } from 'mongoose';

const mockData: [string, Record<string, string>] = [
  '0x69898c16f9153950cf07b9db36a0f3aeb2f51372',
  {
    DNA: 'human,elves',
    head: 'pink punk head',
  },
];

describe('AttributesService', () => {
  let service: AttributesService;

  const mockNftCollectionAttributesModel: Partial<
    Model<NFTCollectionAttributesDocument>
  > = {
    aggregate: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AttributesService,
        {
          provide: getModelToken(NFTCollectionAttributes.name),
          useValue: mockNftCollectionAttributesModel,
        },
      ],
    }).compile();

    service = module.get(AttributesService);
  });

  it('should create an instance of the attributes service', async () => {
    expect(service).toBeDefined();
  });

  describe('getTokenIdsByAttributes', () => {
    it('should call aggregate with the correct query', async () => {
      await service.getTokenIdsByAttributes(...mockData);

      expect(mockNftCollectionAttributesModel.aggregate).toBeCalledWith([
        {
          $match: {
            contractAddress: '0x69898c16f9153950cf07b9db36a0f3aeb2f51372',
          },
        },
        {
          $project: {
            tokens: {
              $concatArrays: [
                '$attributes.DNA.human',
                '$attributes.DNA.elves',
                '$attributes.head.pink punk head',
              ],
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
    });
  });
});
