import { Test } from '@nestjs/testing';
import { OrdersService } from './mongo-orders.service';
import { OrdersController } from './orders.controller';
import { ModuleMocker, MockFunctionMetadata } from 'jest-mock';
import { Order } from './order.entity';
import { getModelToken } from '@nestjs/mongoose';
import { MockAppConfig } from '../../../test/MockAppConfig';
import { MockOrder } from '../../../test/MockOrder';
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
  validSellETHBundle,
  validSellETHOrder,
} from '../../../test/order.mocks';
import { PrepareTxDto, QueryDto } from './order.dto';
import { AssetClass, OrderSide, OrderStatus } from './order.types';
import { Utils } from '../../common/utils';
import { PROD_TOKEN_ADDRESSES, TOKENS } from '../coingecko/tokens';

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

  describe('create order', () => {
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

    it('creates valid ERC721_BUNDLE sell order', async () => {
      jest.spyOn(dataLayerService, 'bundleContainsListedNft')
        .mockReturnValueOnce(false);

      await orderService.createOrderAndCheckSubscribe(validSellETHBundle);
      expect(dataLayerService.createOrder).toBeCalled();
    });

    it('throws if type is invalid or not found ', async () => {
      const invalidOrder = JSON.parse(JSON.stringify(validSellETHOrder));
      invalidOrder.type = 'INVALID';

      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(invalidOrder),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_ORDER_TYPE_ERROR),
      );

      invalidOrder.type = '';
      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(invalidOrder),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_ORDER_TYPE_ERROR),
      );

      delete invalidOrder.type;
      expect(
        async () =>
          await orderService.createOrderAndCheckSubscribe(invalidOrder),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_ORDER_TYPE_ERROR),
      );
    });

    it('deletes bundle properties if exist (single order)', async () => {
      const singleOrder = {
        ...validSellETHOrder,
      };

      singleOrder.make.assetType.contracts = ['123', '321'];
      singleOrder.make.assetType.tokenIds = ['1', '2'];
      singleOrder.make.assetType.bundleName = 'test-bundle';
      singleOrder.make.assetType.bundleDescription = 'test';

      const result = orderService.removeUnexpectedPropeties(singleOrder);

      expect(result).toMatchObject(validSellETHOrder);
    });

    it('deletes single order properties if exist (bundle)', async () => {
      const bundleOrder = JSON.parse(JSON.stringify(validSellETHBundle));
      bundleOrder.make.assetType.contract = '123';
      bundleOrder.make.assetType.tokenId = '1';

      const result = orderService.removeUnexpectedPropeties(bundleOrder);

      expect(result).toMatchObject(bundleOrder);
    });

    it('throws if active sell order for nft exists', async () => {
      // findExistingOrder should return non empty object
      jest
        .spyOn(dataLayerService, 'findExistingOrder')
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

    it('throws if ERC721_BUNDLE order has value not equal to the number of tokens', async () => {
      const bundleOrderWrongValue = JSON.parse(JSON.stringify(validSellETHBundle));
      bundleOrderWrongValue.make.value = '1';

      expect(
        async () => 
          await orderService.createOrderAndCheckSubscribe(bundleOrderWrongValue))
      .rejects.toThrowError(
        new MarketplaceException(constants.INVALID_BUNDLE_DATA_ERROR),
      );
    });

    it('throws if ERC721_BUNDLE order has number of contracts.length not equal tokenIds.length', async () => {
      const bundleOrderWrongTokenIds = JSON.parse(JSON.stringify(validSellETHBundle));
      bundleOrderWrongTokenIds.make.assetType.tokenIds = [['99']];

      expect(
        async () => 
          await orderService.createOrderAndCheckSubscribe(bundleOrderWrongTokenIds))
      .rejects.toThrowError(
        new MarketplaceException(constants.INVALID_BUNDLE_DATA_ERROR),
      );
    });

    it('throws if ERC721_BUNDLE order has duplicates in contracts or tokenIds', async () => {
      const bundleOrderDuplicatedTokenIds = JSON.parse(JSON.stringify(validSellETHBundle));
      bundleOrderDuplicatedTokenIds.make.assetType.tokenIds[0] = [['99', '99', '11']];
      bundleOrderDuplicatedTokenIds.make.value = '4';

      expect(
        async () => 
          await orderService.createOrderAndCheckSubscribe(bundleOrderDuplicatedTokenIds))
      .rejects.toThrowError(
        new MarketplaceException(constants.INVALID_BUNDLE_DATA_ERROR),
      );
      
      const bundleOrderDuplicatedContracts = JSON.parse(JSON.stringify(validSellETHBundle));
      bundleOrderDuplicatedContracts.make.assetType.contracts = [
        '0x99999999999999999999aaaaaaaaaaaaaaaaaaaa',
        '0x99999999999999999999aaaaaaaaaaaaaaaaaaaa',
        '0x99999999999999999999bbbbbbbbbbbbbbbbbbbb',
      ];
      bundleOrderDuplicatedContracts.make.assetType.tokenIds = [
        ['11'], ['22', '33'], ['44'],
      ];
      bundleOrderDuplicatedContracts.make.value = '4';

      expect(
        async () => 
          await orderService.createOrderAndCheckSubscribe(bundleOrderDuplicatedContracts))
      .rejects.toThrowError(
        new MarketplaceException(constants.INVALID_BUNDLE_DATA_ERROR),
      );
    });
    
    it('throws if ERC721_BUNDLE sell order has an NFT that is already listed', async () => {
      const bundleOrder = JSON.parse(JSON.stringify(validSellETHBundle));

      jest.spyOn(dataLayerService, 'bundleContainsListedNft')
        .mockReturnValueOnce(true);

      expect(
        async () => 
          await orderService.createOrderAndCheckSubscribe(bundleOrder))
      .rejects.toThrowError(
        new MarketplaceException(constants.ORDER_ALREADY_EXISTS),
      );
    });
  });

  describe('prepare order execution', () => {
    const hash = 'test-hash';
    const data: PrepareTxDto = {
      maker: '0x111Acb',
      amount: '1',
    };

    it('throws if order has filled status', async () => {
      jest
        .spyOn(dataLayerService, 'getOrderByHash')
        .mockImplementationOnce(async () => {
          return { status: OrderStatus.FILLED };
        });

      expect(
        async () => await orderService.prepareOrderExecution(hash, data),
      ).rejects.toThrowError(
        new MarketplaceException(constants.ORDER_ALREADY_FILLED_ERROR),
      );
    });

    it('throws if user allowance check does not pass', async () => {
      jest
        .spyOn(dataLayerService, 'getOrderByHash')
        .mockImplementationOnce(async () => {
          return { ...validSellETHOrder, status: OrderStatus.CREATED };
        });

      jest
        .spyOn(ethereumService, 'verifyAllowance')
        .mockImplementationOnce(async () => false);

      expect(
        async () => await orderService.prepareOrderExecution(hash, data),
      ).rejects.toThrowError(
        new MarketplaceException(constants.NFT_ALLOWANCE_ERROR),
      );
    });

    it('throws if assetClass is ETH', async () => {
      jest
        .spyOn(dataLayerService, 'getOrderByHash')
        .mockImplementationOnce(async () => {
          return {
            ...validSellETHOrder,
            status: OrderStatus.CREATED,
            make: { assetType: { assetClass: AssetClass.ETH } },
          };
        });

      jest
        .spyOn(ethereumService, 'verifyAllowance')
        .mockImplementationOnce(async () => true);

      expect(
        async () => await orderService.prepareOrderExecution(hash, data),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_SELL_ORDER_ASSET_ERROR),
      );
    });

    it('returns empty string if query by hash fails', async () => {
      jest
        .spyOn(dataLayerService, 'getOrderByHash')
        .mockImplementationOnce(async () => null);

      const result = await orderService.prepareOrderExecution(hash, data);

      expect(result).toEqual('');
    });

    it('returns correct tx', async () => {
      jest
        .spyOn(dataLayerService, 'getOrderByHash')
        .mockImplementationOnce(async () => ({
          ...validSellETHOrder,
          status: OrderStatus.CREATED,
        }));

      jest
        .spyOn(ethereumService, 'verifyAllowance')
        .mockImplementationOnce(async () => true);

      jest
        .spyOn(ethereumService, 'calculateTxValue')
        .mockImplementationOnce(async () => '');
      const returnValue = 'some-test-tx';
      jest
        .spyOn(ethereumService, 'prepareMatchTx')
        .mockImplementationOnce(async () => returnValue);

      const result = await orderService.prepareOrderExecution(hash, data);
      expect(result).toEqual(returnValue);
    });
  });

  describe('query all', () => {
    const queryDto: QueryDto = {
      maker: '',
      side: 0,
      assetClass: AssetClass.ETH,
      collection: '',
      tokenIds: '',
      beforeTimestamp: 0,
      token: '',
      minPrice: '',
      maxPrice: '',
      sortBy: '',
      hasOffers: false,
    };

    const prices = [1, 2, 3, 4, 5];
    const addresses = [
      PROD_TOKEN_ADDRESSES[TOKENS.ETH],
      PROD_TOKEN_ADDRESSES[TOKENS.WETH],
      PROD_TOKEN_ADDRESSES[TOKENS.DAI],
      PROD_TOKEN_ADDRESSES[TOKENS.XYZ],
      PROD_TOKEN_ADDRESSES[TOKENS.USDC],
    ];

    const decimals = [6, 8, 9, 10, 11];

    beforeEach(() => {
      jest.spyOn(dataLayerService, 'queryAll').mockImplementationOnce(() => {});
      jest
        .spyOn(OrdersService.prototype as any, 'getERC20TokensInfo')
        .mockImplementation(() => {
          return { prices, addresses, decimals };
        });
    });

    it('throws if side is invalid', async () => {
      const invalidSide = { ...queryDto, side: 3 };
      expect(
        async () => await orderService.queryAll(invalidSide),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_ORDER_SIDE),
      );
    });

    it('call db service with default page params', async () => {
      const utcTimestamp = Utils.getUtcTimestamp();
      const query = { ...queryDto };

      query.page = 0;
      await orderService.queryAll(query);

      query.page = 1;
      const skippedItems = 0;

      expect(dataLayerService.queryAll).toBeCalledWith(
        query,
        utcTimestamp,
        skippedItems,
        prices,
        addresses,
        decimals,
      );
    });

    it('call db service with default limit params', async () => {
      const utcTimestamp = Utils.getUtcTimestamp();
      const query = { ...queryDto };

      query.limit = 0;
      await orderService.queryAll(query);

      query.limit = constants.DEFAULT_LIMIT;
      const skippedItems = 0;

      expect(dataLayerService.queryAll).toBeCalledWith(
        query,
        utcTimestamp,
        skippedItems,
        prices,
        addresses,
        decimals,
      );
    });

    it('call db service with default max limit params', async () => {
      const utcTimestamp = Utils.getUtcTimestamp();
      const query = { ...queryDto };
      query.limit = 10000;
      await orderService.queryAll(query);

      query.limit = constants.OFFSET_LIMIT;
      const skippedItems = 0;

      expect(dataLayerService.queryAll).toBeCalledWith(
        query,
        utcTimestamp,
        skippedItems,
        prices,
        addresses,
        decimals,
      );
    });

    it('call db service with correct page', async () => {
      const utcTimestamp = Utils.getUtcTimestamp();

      queryDto.page = 2;
      await orderService.queryAll(queryDto);

      const skippedItems = 12;

      expect(dataLayerService.queryAll).toBeCalledWith(
        queryDto,
        utcTimestamp,
        skippedItems,
        prices,
        addresses,
        decimals,
      );
    });

    it('call db service with parsed numbers', async () => {});
  });

  describe('fetch last and best fffer', () => {
    const invalidContractAddress = '0x1';
    const invalidTokenId = '1-invalid-token-id';
    const validContractAddress = '0x5a322b56ed080c559da183b69aa720d19690eaf2';
    const validTokenId = '1';

    it('should throw if contract is invalid', () => {
      expect(async () =>
        orderService.fetchLastAndBestOffer(
          invalidContractAddress,
          validTokenId,
        ),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_CONTRACT_ADDRESS),
      );
    });

    it('should throw if token id is invalid', () => {
      expect(async () =>
        orderService.fetchLastAndBestOffer(
          validContractAddress,
          invalidTokenId,
        ),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_TOKEN_ID),
      );
    });

    it('should return null if no best offer exists', async () => {
      jest
        .spyOn(dataLayerService, 'getBestAndLastOffer')
        .mockReturnValueOnce([null, null]);

      const result = await orderService.fetchLastAndBestOffer(
        validContractAddress,
        validTokenId,
      );

      expect(result.bestOffer).toEqual(null);
    });

    it('should return correct orders', async () => {
      const bestOffers = [{ id: '1' }];
      const lastOffer = { id: '2' };

      jest
        .spyOn(dataLayerService, 'getBestAndLastOffer')
        .mockReturnValueOnce([bestOffers, lastOffer]);

      const result = await orderService.fetchLastAndBestOffer(
        validContractAddress,
        validTokenId,
      );

      expect(result.bestOffer).toEqual(bestOffers[0]);
      expect(result.lastOffer).toEqual(lastOffer);
    });
  });

  describe('get floor price and volume traded', () => {
    const invalidContractAddress = '0x1';
    const validContractAddress = '0x5a322b56ed080c559da183b69aa720d19690eaf2';

    it('should throw if contract is invalid', () => {
      expect(async () =>
        orderService.getCollection(invalidContractAddress),
      ).rejects.toThrowError(
        new MarketplaceException(constants.INVALID_CONTRACT_ADDRESS),
      );
    });

    it('should return correct info', async () => {
      const volumeTraded = 0.5;
      const floorPrice = 12.5;

      jest
        .spyOn(OrdersService.prototype as any, 'getCollectionFloorPrice')
        .mockReturnValueOnce(floorPrice);

      jest
        .spyOn(OrdersService.prototype as any, 'getCollectionVolumeTraded')
        .mockReturnValueOnce(volumeTraded);

      const result = await orderService.getCollection(validContractAddress);

      expect(result).toEqual({ floorPrice, volumeTraded });
    });
  });
});
