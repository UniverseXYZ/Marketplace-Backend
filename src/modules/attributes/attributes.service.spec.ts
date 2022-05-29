import { Test, TestingModule } from '@nestjs/testing';
import { AttributesService } from './attributes.service';
import {
  NFTCollectionAttributes,
  NFTCollectionAttributesrSchema,
} from 'datascraper-schema';
import { MongooseModule } from '@nestjs/mongoose';
import {
  rootMongooseTestModule,
  closeInMongodConnection,
} from '../../../test/DBhandler';

describe('AttributesService', () => {
  let service: AttributesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        rootMongooseTestModule(),
        MongooseModule.forFeature([
          {
            name: NFTCollectionAttributes.name,
            schema: NFTCollectionAttributesrSchema,
          },
        ]),
      ],
      providers: [AttributesService],
    }).compile();

    service = module.get(AttributesService);
  });

  it('should create an instance of the attributes service', async () => {
    expect(service).toBeDefined();
  });

  describe('getTokenIdsByAttributes', () => {
    const documents = [
      {
        contractAddress: '0x2b7DD23595aC4c25e98dEf9D53ad2f455C6fE0E1',
        attributes: {
          dna: {
            human: ['1', '2', '3'],
            robot: ['4', '5', '6', '7'],
          },
        },
      },
      {
        contractAddress: '0x69898c16f9153950cf07b9Db36A0f3AEb2F51372',
        attributes: {
          background: {
            red: ['1', '2', '3'],
            blue: ['4', '5', '6', '7'],
          },
        },
      },
    ];

    it('should return the correct token ids', async () => {
      await service.nftCollectionAttributesModel.insertMany(documents);
      const result = await service.getTokenIdsByAttributes(
        '0x2b7DD23595aC4c25e98dEf9D53ad2f455C6fE0E1',
        { dna: 'robot,human' },
      );
      expect(result).toEqual([{ tokens: ['4', '5', '6', '7', '1', '2', '3'] }]);
    });
  });

  afterAll(async () => {
    await closeInMongodConnection();
  });
});
