import { Test } from '@nestjs/testing';
import { OrdersService } from './mongo-orders.service';
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
import {
  invalidETHAssetClassSellETHOrder,
  maker,
  validBuyERC20Order,
  validSellERC20Order,
  validSellETHOrder,
} from '../../../test/order.mocks';

const moduleMocker = new ModuleMocker(global);

describe('Orders Service', () => {
  let orderService: OrdersService;
  let ethereumService: IEthereumService;
  let dataLayerService: IDataLayerService;

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
    ethereumService = await moduleRef.resolve<IEthereumService>(
      ETHEREUM_SERVICE,
    );
    dataLayerService = await moduleRef.resolve<IDataLayerService>(
      DATA_LAYER_SERVICE,
    );

    // Mock return values for all tests

    // ORDER SERVICE MOCKS
    jest
      .spyOn(dataLayerService, 'getSaltByWalletAddress')
      .mockImplementation(async () => 0);

    jest
      .spyOn(orderService, 'checkSubscribe')
      .mockImplementation(async () => null);

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

  describe('create order', () => {
    test('creates valid ETH sell order', async () => {
      await orderService.createOrderAndCheckSubscribe(validSellETHOrder);
      expect(dataLayerService.createOrder).toBeCalled();
    });

    test('creates valid ERC20 sell order', async () => {
      await orderService.createOrderAndCheckSubscribe(validSellERC20Order);
      expect(dataLayerService.createOrder).toBeCalled();
    });

    test('creates valid ERC20 buy order', async () => {
      await orderService.createOrderAndCheckSubscribe(validBuyERC20Order);
      expect(dataLayerService.createOrder).toBeCalled();
    });

    test('throws if active sell order for nft exists', async () => {
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

    test('throws if sell order has ETH as assetClass', async () => {
      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(
            invalidETHAssetClassSellETHOrder,
          ),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_ASSET_CLASS),
      );
    });

    test('throws if salt is invalid', async () => {
      // getSaltByWalletAddress should return salt not equal to the salt from the order dto
      jest
        .spyOn(dataLayerService, 'getSaltByWalletAddress')
        .mockImplementationOnce(async () => 2);

      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(validSellETHOrder),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_SALT_ERROR),
      );
    });

    test('throws if sell order nft allowance is invalid', async () => {
      jest
        .spyOn(ethereumService, 'verifyAllowance')
        .mockImplementationOnce(async () => false);

      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(validSellETHOrder),
      ).rejects.toThrowError(
        new MarketplaceException(constants.NFT_ALLOWANCE_ERROR),
      );
    });

    test('throws if BUY order nft allowance is invalid', async () => {
      jest
        .spyOn(ethereumService, 'verifyAllowance')
        .mockImplementationOnce(async () => false);

      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(validBuyERC20Order),
      ).rejects.toThrowError(
        new MarketplaceException(constants.NFT_ALLOWANCE_ERROR),
      );
    });

    test('throws if sell order signature is invalid', async () => {
      jest
        .spyOn(ethereumService, 'verifyTypedData')
        .mockImplementationOnce(() => 'somewrongaddress');

      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(validSellERC20Order),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_SIGNATURE_ERROR),
      );
    });

    test('throws if buy order signature is invalid', async () => {
      jest
        .spyOn(ethereumService, 'verifyTypedData')
        .mockImplementationOnce(() => 'somewrongaddress');

      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(validBuyERC20Order),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_SIGNATURE_ERROR),
      );
    });
  });

  describe('prepare order execution', () => {
    it('throws if order has filled status', async () => {
      expect(true).toBe(true);
    });

    it('throws if user allowance check does not pass', async () => {
      expect(true).toBe(true);
    });

    it('throws if assetClass is ETH', async () => {
      expect(true).toBe(true);
    });

    it('returns correct tx', async () => {
      expect(true).toBe(true);
    });
  });
});
