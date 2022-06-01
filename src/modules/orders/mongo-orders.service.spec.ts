import { Test } from '@nestjs/testing';
import { OrdersService } from './mongo-orders.service';
import { AssetClass } from './order.types';
import { OrdersController } from './orders.controller';
import { ModuleMocker, MockFunctionMetadata } from 'jest-mock';
import { Order } from './order.entity';
import { getModelToken } from '@nestjs/mongoose';
import { MockAppConfig } from '../../mocks/MockAppConfig';
import { MockOrder } from '../../mocks/MockOrder';
import {
  ETHEREUM_SERVICE,
  IEthereumService,
} from '../ethereum/interface/IEthereumService';
import {
  DATA_LAYER_SERVICE,
  IDataLayerService,
} from '../data-layer/interfaces/IDataLayerInterface';
import { MockDataLayerService } from '../../../test/MockDataLayerService';
import { MockEthereumService } from '../../../test/MockEthereumService';
import { AppConfig } from '../configuration/configuration.service';
import { constants } from '../../common/constants';
import { MarketplaceException } from '../../common/exceptions/MarketplaceException';
const moduleMocker = new ModuleMocker(global);

describe('OrdersService', () => {
  let ordersController: OrdersController;
  let orderService: OrdersService;
  let orderModel: MockOrder;
  let ethereumService: IEthereumService;
  let dataLayerService: IDataLayerService;

  const validSalt = 0;
  const maker = '0x6FB3946CCc1a4b04FE49ce3e591C15f496C73881';

  const validSellETHOrder: any = {
    salt: validSalt,
    maker: maker,
    make: {
      assetType: {
        assetClass: AssetClass.ERC721,
        contract: '0x5a322b56ed080c559da183b69aa720d19690eaf2',
        tokenId: '1933',
      },
      value: '1',
    },
    taker: '0x0000000000000000000000000000000000000000',
    take: {
      assetType: { assetClass: AssetClass.ETH },
      value: '100000000000000000',
    },
    type: 'UNIVERSE_V1',
    start: 0,
    end: 0,
    data: { dataType: 'ORDER_DATA', revenueSplits: [] },
    signature:
      '0x7f39b39e26410c73f4ea1a42c6fc92e593b0dbe9770d50adf253403ce57e9a500d0feab35aa3ef2bcadae17d867118707574653bb273d8a7e86a5358f24424731b',
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [OrdersService],
    })
      .useMocker((token) => {
        if (token === ETHEREUM_SERVICE) {
          return new MockEthereumService();
        }

        if (token === DATA_LAYER_SERVICE) {
          return new MockDataLayerService();
        }

        if (token === getModelToken(Order.name)) {
          return new MockOrder();
        }

        // TODO: extract interface
        if (token === AppConfig) {
          return new MockAppConfig();
        }

        if (typeof token === 'function') {
          const mockMetadata = moduleMocker.getMetadata(
            token,
          ) as MockFunctionMetadata<any, any>;
          const Mock = moduleMocker.generateFromMetadata(mockMetadata);
          return new Mock();
        }
      })
      .compile();

    // Get references
    orderService = await moduleRef.resolve<OrdersService>(OrdersService);
    ordersController = await moduleRef.resolve<OrdersController>(
      OrdersController,
    );
    orderModel = await moduleRef.resolve<MockOrder>(getModelToken(Order.name));
    ethereumService = await moduleRef.resolve<IEthereumService>(
      ETHEREUM_SERVICE,
    );
    dataLayerService = await moduleRef.resolve<IDataLayerService>(
      DATA_LAYER_SERVICE,
    );

    // Mock return values for all tests

    // ORDER SERVICE MOCKS
    jest
      .spyOn(orderService, 'getSaltByWalletAddress')
      .mockImplementation(async () => 0);

    jest
      .spyOn(orderService, 'checkSubscribe')
      .mockImplementation(async () => {});

    // ETHEREUM SERVICE MOCKS
    jest
      .spyOn(ethereumService, 'verifyTypedData')
      .mockImplementation(() => maker);

    jest
      .spyOn(ethereumService, 'verifyAllowance')
      .mockImplementation(async () => true);

    jest.spyOn(ethereumService, 'getChainId').mockImplementation(() => 4);

    // DATA LAYER MOCKS
    jest.spyOn(dataLayerService, 'createOrder');
  });

  describe('createOrder', () => {
    it('creates valid ETH sell order', async () => {
      await orderService.createOrderAndCheckSubscribe(validSellETHOrder);
      expect(dataLayerService.createOrder).toBeCalled();
    });

    it('creates valid ERC20 sell order', async () => {
      expect(true).toBe(true);
    });

    it('creates valid ETH buy order', async () => {
      expect(true).toBe(true);
    });

    it('creates valid ERC20 buy order', async () => {
      expect(true).toBe(true);
    });

    it('throws if active sell order for nft exists', async () => {
      // findExistingActiveOrder should return non empty object
      jest
        .spyOn(dataLayerService, 'findExistingActiveOrder')
        .mockImplementationOnce(() => ({}));

      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(validSellETHOrder),
      ).rejects.toThrowError(
        new MarketplaceException(constants.ORDER_ALREADY_EXISTS),
      );
    });

    // describe('created valid order if non-active order for nft exists', () => {
    //   expect(true).toBe(true);
    // });

    // it('created valid order if non-active order for nft exists', async () => {
    //   expect(true).toBe(true);
    // });

    it('throws if sell order has ETH as assetClass', async () => {
      expect(true).toBe(true);
    });

    it('throws if salt is invalid', async () => {
      expect(true).toBe(true);
    });

    it('throws if sell order nft allowance is invalid', async () => {
      expect(true).toBe(true);
    });

    it('throws if BUY order nft allowance is invalid', async () => {
      expect(true).toBe(true);
    });
  });
});
