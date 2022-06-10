import { Test, TestingModule } from '@nestjs/testing';
import { CoingeckoService } from './coingecko.service';
import { TokensController } from './coingecko.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Token } from './tokens.entity';
import { TokenPricesSchema } from '../orders/schema/token-prices.schema';
import {
  rootMongooseTestModule,
  closeInMongodConnection,
} from '../../../test/DBhandler';
import { AppConfig } from '../configuration/configuration.service';
import { MockAppConfig } from '../../mocks/MockAppConfig';

describe('Coingecko Service', () => {
  let coingeckoService: CoingeckoService = null;
  

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        rootMongooseTestModule(),
        MongooseModule.forFeature([
          {
            name: Token.name,
            schema: TokenPricesSchema,
          },
        ]),
      ],
      controllers: [TokensController],
      providers: [CoingeckoService],
    }).useMocker((token) => {

      if (token === AppConfig) {
        return new MockAppConfig();
      }

    }).compile();

    coingeckoService = module.get(CoingeckoService);
  });

  describe('getTokenByName', () => {

    it('should call getTokenByName', async () => {
      jest.spyOn(coingeckoService, 'queryByName');
      await coingeckoService.queryByName('ethereum');
      expect(coingeckoService.queryByName).toBeCalled();
    });

    it('should return null if name is invalid', async () => {
      const mockedTokensData = [
        {
          symbol: 'ETH',
          usd: 2000,
          name: 'ethereum'
        },
        {
          symbol: 'DAI',
          usd: 1,
          name: 'dai'
        },
      ];
      await coingeckoService.tokensModel.insertMany(mockedTokensData);

      jest.spyOn(coingeckoService, 'queryByName')

      const result = await coingeckoService.queryByName('invalid');
      expect(result).toEqual(null);
    });

  });

  describe('updateTokenById', () => {
    beforeEach(async () => {
      const mockedTokensData = [
        {
          symbol: 'ETH',
          usd: 2000,
          name: 'ethereum'
        },
        {
          symbol: 'DAI',
          usd: 1,
          name: 'dai'
        },
      ];
      await coingeckoService.tokensModel.insertMany(mockedTokensData);
    });

    it('should call db with correct query', async () => {
      const ethereumMockedData = await coingeckoService.queryByName('ethereum');
      console.log(ethereumMockedData);
      const tokensModel = coingeckoService.tokensModel;
      jest.spyOn(tokensModel, 'updateOne');
      await coingeckoService.updateTokenById(ethereumMockedData._id, ethereumMockedData);

      expect(tokensModel.updateOne).toBeCalledWith({ _id: ethereumMockedData._id }, ethereumMockedData);
    });
  });

  afterAll(async () => {
    await closeInMongodConnection();
  });
});
