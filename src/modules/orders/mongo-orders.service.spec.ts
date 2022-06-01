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

  const invalidETHAssetClassSellETHOrder: any = {
    salt: validSalt,
    maker: maker,
    make: {
      assetType: {
        assetClass: AssetClass.ETH,
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

  const validSellERC20Order: any = {
    salt: validSalt,
    maker: maker,
    make: {
      assetType: {
        assetClass: 'ERC721',
        contract: '0x5a322b56ed080c559da183b69aa720d19690eaf2',
        tokenId: '3580',
      },
      value: '1',
    },
    taker: '0x0000000000000000000000000000000000000000',
    take: {
      assetType: {
        assetClass: 'ERC20',
        contract: '0x81B5Be5957dEAd02105CbDb389a3A7a25Aa925ec',
      },
      value: '10000000000000000000',
    },
    type: 'UNIVERSE_V1',
    start: 0,
    end: 0,
    data: { dataType: 'ORDER_DATA', revenueSplits: [] },
  };

  const validBuyERC20Order: any = {
    type: 'UNIVERSE_V1',
    maker: maker,
    taker: '0x0000000000000000000000000000000000000000',
    make: {
      assetType: {
        assetClass: 'ERC20',
        contract: '0xc778417e063141139fce010982780140aa0cd5ab',
      },
      value: '120000000000000000',
    },
    take: {
      value: '1',
      assetType: {
        tokenId:
          '53294341517339190515659799140861485604612658297401227284598735892131312828418',
        contract: '0xa39efe3e3d2ffd1756d6440738c1ef20f60bcc2d',
        assetClass: 'ERC721',
      },
    },
    salt: validSalt,
    start: 0,
    end: 1651817780,
    data: { dataType: 'ORDER_DATA', revenueSplits: [] },
    signature:
      '0x98cb14e26822f5c09981085bdb569e704f1a1aa4ad0a425dc3ad001a3cf0922c18e236879d095ca51d0a1ad5369e0c0a3112a9e91fae676f38f89234030737ef1c',
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
      .spyOn(dataLayerService, 'getSaltByWalletAddress')
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
      await orderService.createOrderAndCheckSubscribe(validSellERC20Order);
      expect(dataLayerService.createOrder).toBeCalled();
    });

    it('creates valid ERC20 buy order', async () => {
      await orderService.createOrderAndCheckSubscribe(validBuyERC20Order);
      expect(dataLayerService.createOrder).toBeCalled();
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

    it('throws if sell order has ETH as assetClass', async () => {
      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(
            invalidETHAssetClassSellETHOrder,
          ),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_ASSET_CLASS),
      );
    });

    it('throws if salt is invalid', async () => {
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

    it('throws if sell order nft allowance is invalid', async () => {
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

    it('throws if BUY order nft allowance is invalid', async () => {
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

    it('throws if sell order signature is invalid', async () => {
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

    it('throws if buy order signature is invalid', async () => {
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
});
