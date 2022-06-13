/* eslint-disable @typescript-eslint/no-empty-function */
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ModuleMocker, MockFunctionMetadata } from 'jest-mock';
import {
  createOrderDto,
  validBuyERC20Order,
  validSellERC20Order,
  validSellETHOrder,
  validSellETHBundle,
} from '../../../test/order.mocks';
<<<<<<< HEAD
import { MockOrder } from '../../../test/MockOrder';
import configuration from '../configuration';
=======
import { MockAppConfig } from '../../../test/MockAppConfig';
import { MockOrder } from '../../../test/MockOrder';
>>>>>>> 41da8cb (sc-4830: BE - Enable creating ERC721_BUNDLE orders)
import { AppConfig } from '../configuration/configuration.service';
import { Order } from '../orders/order.entity';
import { DataLayerService } from './daya-layer.service';
import { Model } from 'mongoose';
import { Utils } from '../../common/utils';
import { AssetClass, OrderSide, OrderStatus } from '../orders/order.types';
import { PROD_TOKEN_ADDRESSES, TOKENS } from '../coingecko/tokens.config';
import { CancelOrder } from '../orders/order.dto';

const moduleMocker = new ModuleMocker(global);

describe('Data Layer Service', () => {
  let dataLayerService: DataLayerService = null;
  let orderModel: MockOrder = null;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DataLayerService, AppConfig],
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: false,
          ignoreEnvVars: false,
          isGlobal: true,
          load: [configuration],
        }),
      ],
    })
      .useMocker((token) => {

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

  describe('findExistingOrders', () => {
    it('should have correct query', async () => {
      jest.spyOn(orderModel, 'findOne');

      const utcTimestamp = Utils.getUtcTimestamp();

      const tokenId = '1';
      const contract = '0xC0n7TrAcT';
      await dataLayerService.findExistingOrders(tokenId, contract, utcTimestamp);
      expect(orderModel.find).toBeCalled();
      expect(orderModel.find).toHaveBeenCalledWith({
        side: OrderSide.SELL,
        status: { $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED] },
        'make.assetType.tokenId': tokenId,
        'make.assetType.contract': contract.toLowerCase(),
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
          { side: OrderSide.SELL },
          {
            $or: [
              {
                status: OrderStatus.CREATED,
              },
              {
                status: OrderStatus.PARTIALFILLED,
              },
            ],
          },
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
          { side: OrderSide.SELL },
          {
            $or: [
              {
                status: OrderStatus.CREATED,
              },
              {
                status: OrderStatus.PARTIALFILLED,
              },
            ],
          },
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

  describe('staleOrders', () => {
    it('should call db with correct query', async () => {
      jest.spyOn(orderModel, 'bulkWrite');

      await dataLayerService.staleOrders([validSellERC20Order]);

      expect(orderModel.bulkWrite).toBeCalledWith([
        {
          updateOne: {
            filter: { hash: validSellERC20Order.hash },
            update: {
                status: OrderStatus.STALE,
            },
          },
        }
      ]);
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
    const orderTaker = '0xCr3At0r';
    const erc721OrderNftInfo = validSellERC20Order.make;

    it('should call db with correct query (with contract)', async () => {
      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return []; // otherwise .find will return undefined bc of the DB connection.
      });
      await dataLayerService.queryStaleOrders(erc721OrderNftInfo, orderTaker);

      expect(orderModel.find).toBeCalledWith({
        $and: [
          { side: OrderSide.SELL },
          {
            status: {
              $in: [OrderStatus.CREATED, OrderStatus.PARTIALFILLED],
            },
          },
          { taker: orderTaker.toLowerCase() },
          {
            $or: [
              {
                'make.assetType.tokenId': erc721OrderNftInfo.assetType.tokenId,
                'make.assetType.contract':
                  erc721OrderNftInfo.assetType.contract.toLowerCase(),
              },
              {
                'make.assetType.contracts':
                  erc721OrderNftInfo.assetType.contract.toLowerCase(),
              },
            ]
          },
        ]
      });
    });

    it('should return 1 ERC721 order', async () => {
      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return [validSellETHOrder];
      });

      const ordersToStale = await dataLayerService.queryStaleOrders(
        validSellETHOrder.make,
        validSellETHOrder.taker,
      );

      expect(orderModel.find).toBeCalledTimes(1);
      expect(ordersToStale).toHaveLength(1);
      expect(ordersToStale[0]).toHaveProperty('make.assetType.contract');
      expect(ordersToStale[0].make.assetType.contract)
        .toEqual(validSellETHOrder.make.assetType.contract);
    });

    it('should return 1 ERC721_BUNDLE order', async () => {
      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return [validSellETHBundle];
      });

      const ordersToStale = await dataLayerService.queryStaleOrders(
        validSellETHBundle.make,
        validSellETHBundle.taker,
      );

      expect(orderModel.find).toBeCalledTimes(1);
      expect(ordersToStale).toHaveLength(1);
      expect(ordersToStale[0]).toHaveProperty('make.assetType.contracts');
      expect(ordersToStale[0].make.assetType.contracts[1])
        .toEqual(validSellETHBundle.make.assetType.contracts[1]);
    });
  });

  describe('queryOrdersForStale', () => {
    it('should return 1 ERC721 order', async () => {
      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return [validSellETHOrder];
      });
      
      const ordersToStale = await dataLayerService.queryOrdersForStale(
        '99',
        '0xcontract',
        '0xmaker',
        Utils.getUtcTimestamp(),
      );

      expect(orderModel.find).toBeCalledTimes(1);
      expect(ordersToStale).toHaveLength(1);
      expect(ordersToStale[0]).toHaveProperty('make.assetType.contract');
      expect(ordersToStale[0].make.assetType.contract)
        .toEqual(validSellETHOrder.make.assetType.contract);
    });

    it('should return 1 ERC721_BUNDLE order', async () => {
      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return [validSellETHBundle];
      });

      const ordersToStale = await dataLayerService.queryOrdersForStale(
        validSellETHBundle.make.assetType.tokenIds[1][0],
        validSellETHBundle.make.assetType.contracts[1],
        validSellETHBundle.maker,
        Utils.getUtcTimestamp(),
      );

      expect(orderModel.find).toBeCalledTimes(1);
      expect(ordersToStale).toHaveLength(1);
      expect(ordersToStale[0].make.assetType.contracts[1])
        .toEqual(validSellETHBundle.make.assetType.contracts[1]);
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

  describe('bundleContainsListedNft', () => {
    const utcTimestamp = Utils.getUtcTimestamp();

    it('should return true if there is an active listed bundle order with an NFT from the new bundle', async () => {
      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return [validSellETHBundle];
      })

      const result = await dataLayerService.bundleContainsListedNft(
        validSellETHBundle.make.assetType.tokenIds,
        validSellETHBundle.make.assetType.contracts,
        utcTimestamp
      );
      expect(result).toEqual(true);
    });

    it('should return true if there is an active listed non-bundle order with an NFT from the new bundle', async () => {
      const validSellOrder = JSON.parse(JSON.stringify(validSellERC20Order));
      validSellOrder.make.assetType.contract = '0x5a322b56ed080c559da183b69aa720d19690eaf3';
      validSellOrder.make.assetType.tokenId = '1934';

      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return [validSellOrder];
      })

      const result = await dataLayerService.bundleContainsListedNft(
        validSellETHBundle.make.assetType.tokenIds,
        validSellETHBundle.make.assetType.contracts,
        utcTimestamp
      );
      expect(result).toEqual(true);
    });

    it('should return false if there is no active listings with any NFTs from the bundle', async () => {
      const validSellOrder = JSON.parse(JSON.stringify(validSellERC20Order));
      validSellOrder.make.assetType.contract = '0x5a322b56ed080c559da183b69aa720d19690eaf3';
      validSellOrder.make.assetType.tokenId = '1000'; //not in bundle

      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return [validSellOrder];
      });

      let result = await dataLayerService.bundleContainsListedNft(
        validSellETHBundle.make.assetType.tokenIds,
        validSellETHBundle.make.assetType.contracts,
        utcTimestamp
      );
      expect(result).toEqual(false);

      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return [];
      })

      result = await dataLayerService.bundleContainsListedNft(
        validSellETHBundle.make.assetType.tokenIds,
        validSellETHBundle.make.assetType.contracts,
        utcTimestamp
      );
      expect(result).toEqual(false);
    });
  });

  describe('getSellOrderByBundleAndMaker', () => {
    const utcTimestamp = Utils.getUtcTimestamp();

    it('should return an existing sell bundle order', async () => {
      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return [validSellETHBundle];
      });

      const result = await dataLayerService.getSellOrderByBundleAndMaker(
        validSellETHBundle.make,
        validSellETHBundle.maker,
      );
      expect(orderModel.find).toBeCalledTimes(1);
      expect(result).toHaveProperty('make');
      expect(result.make.assetType.contracts[1]).toEqual(validSellETHBundle.make.assetType.contracts[1]);
    });

    it('should return null if there is a listing with same contracts but different tokenIds', async () => {
      const validSellBundleOrder = JSON.parse(JSON.stringify(validSellETHBundle));
      validSellBundleOrder.make.assetType.tokenIds[1] = ['2000', '2001']; // not in bundle
      validSellBundleOrder.make.value = '3';
      
      jest.spyOn(orderModel, 'find').mockImplementationOnce(() => {
        return [validSellBundleOrder];
      });

      const result = await dataLayerService.getSellOrderByBundleAndMaker(
        validSellETHBundle.make,
        validSellETHBundle.maker,
      );
      expect(orderModel.find).toBeCalledTimes(1);
      expect(result).toEqual(null);
    });

  });
});
