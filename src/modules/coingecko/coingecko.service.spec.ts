import { Test, TestingModule } from '@nestjs/testing';
import { CoingeckoService } from './coingecko.service';
import { CoingeckoServiceExtend } from './coingecko-extend.service';
import { CoingeckoController } from './coingecko.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { TokenPricesSchema, TokenPrices } from './schema/token-prices.schema';
import {
  rootMongooseTestModule,
  closeInMongodConnection,
} from '../../../test/DBhandler';
import { AppConfig } from '../configuration/configuration.service';
import { MockAppConfig } from '../../mocks/MockAppConfig';
import { CreateTokenPriceDTO } from './create-token-price.dto';

describe('Coingecko Service', () => {
  let coingeckoService: CoingeckoService = null;
  let coingeckoServiceExtend: CoingeckoServiceExtend = null;
  

  beforeEach(async () => {
    const spy = jest.spyOn((CoingeckoService as any).prototype, 'updatePrices');
    spy.mockImplementation(() => {})
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        rootMongooseTestModule(),
        MongooseModule.forFeature([
          {
            name: TokenPrices.name,
            schema: TokenPricesSchema,
          },
        ]),
      ],
      controllers: [CoingeckoController],
      providers: [CoingeckoService, CoingeckoServiceExtend],
    }).useMocker((token) => {

      if (token === AppConfig) {
        return new MockAppConfig();
      }

    }).compile();

    coingeckoService = module.get(CoingeckoService);
    coingeckoServiceExtend = module.get(CoingeckoServiceExtend);
  });

  describe('getTokenByName', () => {

    it('should call getTokenByName', async () => {
      jest.spyOn(coingeckoService, 'queryByName');
      await coingeckoService.queryByName('ethereum');
      expect(coingeckoService.queryByName).toBeCalled();
    });

    it('should return null if name is invalid', async () => {
      const mockedTokensData: CreateTokenPriceDTO[] = [
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
      const mockedTokensData: CreateTokenPriceDTO[] = [
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
      const tokensModel = coingeckoService.tokensModel;

      jest.spyOn(tokensModel, 'updateOne');
      await coingeckoService.updateTokenById(ethereumMockedData._id, ethereumMockedData);

      expect(tokensModel.updateOne).toBeCalledWith({ _id: ethereumMockedData._id }, ethereumMockedData);
    });
  });

  describe('updatePrices', () => {

    it('should get the prices from the DB even if the coingecko api is down', async () => {
      const mockedTokensData: CreateTokenPriceDTO[] = [
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

      const result = await coingeckoService.queryByName('ethereum');
      expect(result).toMatchObject(mockedTokensData[0]);
    });

  });

  afterAll(async () => {
    await closeInMongodConnection();
  });
});
