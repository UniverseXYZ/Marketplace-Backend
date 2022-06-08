/* eslint-disable @typescript-eslint/no-empty-function */
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { ModuleMocker, MockFunctionMetadata } from 'jest-mock';
import {
  createOrderDto,
  validBuyERC20Order,
  validSellERC20Order,
  validSellETHOrder,
} from '../../../test/order.mocks';
import { MockAppConfig } from '../../mocks/MockAppConfig';
import { MockOrder } from '../../mocks/MockOrder';
import { AppConfig } from '../configuration/configuration.service';
import { Order } from '../orders/order.entity';
import { DataLayerService } from './daya-layer.service';
import { Model } from 'mongoose';
import { Utils } from '../../common/utils';
import { AssetClass, OrderSide, OrderStatus } from '../orders/order.types';
import { PROD_TOKEN_ADDRESSES, TOKENS } from '../coingecko/tokens';
import { CancelOrder } from '../orders/order.dto';

const moduleMocker = new ModuleMocker(global);

describe('Data Layer Service', () => {
  let dataLayerService: DataLayerService = null;
  let orderModel: MockOrder = null;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DataLayerService],
    })
      .useMocker((token) => {
        // // TODO: extract interface
        if (token === AppConfig) {
          return new MockAppConfig();
        }

        if (token === getModelToken(Order.name)) {
          return new MockOrder();
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

    dataLayerService = await moduleRef.resolve<DataLayerService>(
      DataLayerService,
    );
    orderModel = await moduleRef.resolve<MockOrder>(getModelToken(Order.name));

    jest.spyOn(orderModel, 'countDocuments');
  });

  describe('createOrder', () => {
    it('should call create with correct order', async () => {
      jest.spyOn(orderModel, 'create');

      await dataLayerService.createOrder(createOrderDto);

      expect(orderModel.create).toBeCalled();
      expect(orderModel.create).toBeCalledWith(createOrderDto);
    });
  });

  describe('findExistingOrder', () => {
    it('should have correct query', async () => {
      jest.spyOn(orderModel, 'findOne');

      const utcTimestamp = Utils.getUtcTimestamp();

      const tokenId = '1';
      const contract = '0xC0n7TrAcT';
      await dataLayerService.findExistingOrder(tokenId, contract, utcTimestamp);
      expect(orderModel.findOne).toBeCalled();
      expect(orderModel.findOne).toHaveBeenCalledWith({
        side: OrderSide.SELL,
        status: { $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED] },
        make: {
          assetType: {
            tokenId: tokenId,
            contract: contract.toLowerCase(),
          },
        },
        $and: [{ $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] }],
      });
    });
  });

  describe('getSaltByWalletAddress', () => {
    const walletAddress = '0xAbC';
    const walletOrders = 2;

    it('should return wallet orders + 1', async () => {
      jest
        .spyOn(orderModel, 'countDocuments')
        .mockImplementation(async () => walletOrders);

      const salt = await dataLayerService.getSaltByWalletAddress(walletAddress);

      expect(salt).toEqual(walletOrders + 1);
    });

    it('should call database with lowercase wallet', async () => {
      await dataLayerService.getSaltByWalletAddress(walletAddress);

      expect(orderModel.countDocuments).toBeCalledWith({
        maker: walletAddress.toLowerCase(),
      });
    });
  });

  describe('getOrderByHash', () => {
    const hash = 'test-hash';

    it('should be called with correct query', async () => {
      jest.spyOn(orderModel, 'findOne');

      await dataLayerService.getOrderByHash(hash);

      expect(orderModel.findOne).toBeCalledWith({
        hash,
      });
    });
  });

  describe('getBestAndLastOffer', () => {
    const utcTimestamp = Utils.getUtcTimestamp();
    const tokenId = '1';
    const contract = '0xA123a';
    const prices = [1, 2, 3, 4, 5];
    const addresses = [
      PROD_TOKEN_ADDRESSES[TOKENS.ETH],
      PROD_TOKEN_ADDRESSES[TOKENS.WETH],
      PROD_TOKEN_ADDRESSES[TOKENS.DAI],
      PROD_TOKEN_ADDRESSES[TOKENS.XYZ],
      PROD_TOKEN_ADDRESSES[TOKENS.USDC],
    ];
    const decimals = [6, 8, 9, 10, 11];

    it('should call db with correct query', async () => {
      jest.spyOn(orderModel, 'aggregate');
      jest.spyOn(orderModel, 'findOne').mockReturnThis();

      jest.spyOn(orderModel, 'sort');

      const priceAggregation = dataLayerService.buildPriceAggregation(
        prices,
        addresses,
        decimals,
        OrderSide.SELL,
      );
      await dataLayerService.getBestAndLastOffer(
        utcTimestamp,
        tokenId,
        contract,
        prices,
        addresses,
        decimals,
      );

      expect(orderModel.aggregate).toBeCalledWith([
        ...priceAggregation,
        {
          $match: {
            status: OrderStatus.CREATED,
            side: OrderSide.BUY,
            end: { $gt: utcTimestamp },
            'take.assetType.tokenId': tokenId,
            'take.assetType.contract': contract.toLowerCase(),
          },
        },
        {
          $sort: {
            usd_value: -1,
            createdAt: -1,
            _ud: -1,
          },
        },
        { $limit: 1 },
      ]);

      expect(orderModel.findOne).toBeCalledWith({
        status: OrderStatus.FILLED,
        $or: [
          {
            'take.assetType.tokenId': tokenId,
            'make.assetType.contract': contract.toLowerCase(),
          },
          {
            'take.assetType.tokenId': tokenId,
            'make.assetType.contract': contract.toLowerCase(),
          },
        ],
      });

      expect(orderModel.sort).toBeCalledWith({
        updatedAt: -1,
      });
    });
  });

  describe('getOrderListingHistoryAndCount', () => {
    const tokenId = '2';
    const contract = '0xA123a';
    it('should call db with correct query', async () => {
      jest.spyOn(orderModel, 'aggregate');
      jest.spyOn(orderModel, 'find').mockReturnThis();

      jest.spyOn(orderModel, 'sort');

      await dataLayerService.getOrderListingHistoryAndCount(contract, tokenId);

      const queryFilters = {
        $and: [
          {
            $or: [
              {
                'make.assetType.contract': contract,
              },
              { 'take.assetType.contract': contract },
            ],
          },
          {
            $or: [
              {
                'make.assetType.tokenId': tokenId,
              },
              { 'take.assetType.tokenId': tokenId },
            ],
          },
        ],
      } as any;

      expect(orderModel.find).toBeCalledWith(queryFilters);
      expect(orderModel.sort).toBeCalledWith({ createdAt: -1 });
      expect(orderModel.countDocuments).toBeCalledWith(queryFilters);
    });
  });

  describe('queryOrders', () => {
    const utcTimestamp = Utils.getUtcTimestamp();
    const maker = '0xMak3R';
    const contract = '0xA7891qh';

    it('should call db with correct query (without maker)', async () => {
      jest.spyOn(orderModel, 'find');

      await dataLayerService.queryOrders(utcTimestamp, '', contract);

      expect(orderModel.find).toBeCalledWith({
        $and: [
          { status: OrderStatus.CREATED },
          { side: OrderSide.SELL },
          {
            $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
          },
          { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
          {
            $or: [
              { 'make.assetType.contract': contract.toLowerCase() },
              { 'make.assetType.contracts': contract.toLowerCase() },
            ],
          },
        ],
      });
    });

    it('should call db with correct query (with maker)', async () => {
      jest.spyOn(orderModel, 'find');

      await dataLayerService.queryOrders(utcTimestamp, maker, contract);

      expect(orderModel.find).toBeCalledWith({
        $and: [
          { status: OrderStatus.CREATED },
          { side: OrderSide.SELL },
          {
            $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
          },
          { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
          { maker: maker.toLowerCase() },
          {
            $or: [
              { 'make.assetType.contract': contract.toLowerCase() },
              { 'make.assetType.contracts': contract.toLowerCase() },
            ],
          },
        ],
      });
    });
  });

  describe('updateById', () => {
    const _id = '123467';
    it('should call db with correct query', async () => {
      jest.spyOn(orderModel, 'updateOne');

      const order = {
        _id,
        ...validSellERC20Order,
      };
      await dataLayerService.updateById(order);

      expect(orderModel.updateOne).toBeCalledWith({ _id }, order);
    });
  });

  describe('staleOrder', () => {
    it('should call db with correct query', async () => {
      jest.spyOn(orderModel, 'updateOne');

      await dataLayerService.staleOrder(validSellERC20Order);

      expect(orderModel.updateOne).toBeCalledWith(
        { hash: validSellERC20Order.hash },
        { status: OrderStatus.STALE },
      );
    });
  });

  describe('updateMany', () => {
    const orders = [validSellERC20Order, validBuyERC20Order];

    it('should call db with correct query', async () => {
      jest.spyOn(orderModel, 'bulkSave');

      await dataLayerService.updateMany(orders);

      expect(orderModel.bulkSave).toBeCalledWith(orders);
    });
  });

  describe('cancelOrder', () => {
    const event: CancelOrder = {
      txHash: 'txHash',
      leftMaker: '0x1123',
      leftOrderHash: 'left-order-hash',
    };

    it('should call db with correct query', async () => {
      jest.spyOn(orderModel, 'updateOne');

      await dataLayerService.cancelOrder(event);
      expect(orderModel.updateOne).toBeCalledWith(
        {
          hash: event.leftOrderHash,
          maker: event.leftMaker,
          status: {
            $in: [
              OrderStatus.CREATED,
              OrderStatus.STALE,
              OrderStatus.CANCELLED,
            ],
          },
        },
        {
          status: OrderStatus.CANCELLED,
          cancelledTxHash: event.txHash,
        },
      );
    });
  });

  describe('fetchPendingOrders', () => {
    const walletAddress = '0xAD89';

    it('should call db with correct query', async () => {
      jest.spyOn(orderModel, 'find').mockReturnThis();
      jest.spyOn(orderModel, 'limit');

      await dataLayerService.fetchPendingOrders(walletAddress);

      expect(orderModel.find).toBeCalledWith({
        maker: walletAddress.toLowerCase(),
        status: { $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED] },
      });

      expect(orderModel.limit).toBeCalledWith(2);
    });
  });

  describe('queryStaleOrders', () => {
    const creator = '0xCr3At0r';
    const erc20OrderNftInfo = validSellERC20Order.take;
    const ethOrderNftInfo = validSellETHOrder.take;

    it('should call db with correct query (without contract)', async () => {
      jest.spyOn(orderModel, 'find');

      await dataLayerService.queryStaleOrders(creator, ethOrderNftInfo);

      expect(orderModel.find).toBeCalledWith({
        side: OrderSide.SELL,
        status: OrderStatus.CREATED,
        maker: creator.toLowerCase(),
        'make.assetType.tokenId': ethOrderNftInfo.assetType.tokenId,
      });
    });

    it('should call db with correct query (with contract)', async () => {
      jest.spyOn(orderModel, 'find');
      await dataLayerService.queryStaleOrders(creator, erc20OrderNftInfo);

      expect(orderModel.find).toBeCalledWith({
        side: OrderSide.SELL,
        status: OrderStatus.CREATED,
        maker: creator.toLowerCase(),
        'make.assetType.tokenId': erc20OrderNftInfo.assetType.tokenId,
        'make.assetType.contract':
          erc20OrderNftInfo.assetType.contract.toLowerCase(),
      });
    });
  });

  describe('fetchLowestOrder', () => {
    const collection = '0xC0l';
    const utcTimestamp = Utils.getUtcTimestamp();
    it('should call db with correct query', async () => {
      jest.spyOn(orderModel, 'findOne').mockReturnThis();
      jest.spyOn(orderModel, 'sort');

      await dataLayerService.fetchLowestOrder(collection, utcTimestamp);

      expect(orderModel.findOne).toBeCalledWith({
        $and: [
          {
            status: OrderStatus.CREATED,
            side: OrderSide.SELL,
            'make.assetType.contract': collection.toLowerCase(),
            'take.assetType.assetClass': AssetClass.ETH,
          },
          {
            $or: [{ start: { $lt: utcTimestamp } }, { start: 0 }],
          },
          { $or: [{ end: { $gt: utcTimestamp } }, { end: 0 }] },
        ],
      });

      expect(orderModel.sort).toBeCalledWith({ 'take.value': 1 });
    });
  });

  describe('fetchVolumeTraded', () => {
    const collection = '0xa23D';

    it('should call db with correct query', async () => {
      jest.spyOn(orderModel, 'aggregate');

      await dataLayerService.fetchVolumeTraded(collection);

      expect(orderModel.aggregate).toBeCalledWith([
        {
          $addFields: {
            numericValue: { $toDecimal: '$take.value' },
          },
        },
        {
          $match: {
            status: OrderStatus.FILLED,
            side: OrderSide.SELL,
            contract: collection.toLowerCase(),
            'make.assetType.assetClass': AssetClass.ETH,
            'make.assetType.contract': collection.toLowerCase(),
          },
        },
        {
          $group: {
            _id: null,
            sum: { $sum: '$take.value' },
          },
        },
      ]);
    });

    it('should return default value when no orders are found', async () => {
      jest
        .spyOn(orderModel, 'aggregate')
        .mockImplementationOnce(async () => []);

      const result = await dataLayerService.fetchVolumeTraded(collection);

      expect(result).toEqual('0');
    });

    it('should return volume traded', async () => {
      const volumeTraded = 1000;
      jest
        .spyOn(orderModel, 'aggregate')
        .mockImplementationOnce(async () => [{ numericValue: volumeTraded }]);

      const result = await dataLayerService.fetchVolumeTraded(collection);

      expect(result).toEqual(volumeTraded);
    });
  });

  describe('buildPriceAggregation', () => {});
});
