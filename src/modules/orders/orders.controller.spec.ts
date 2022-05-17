import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpException } from '@nestjs/common';
import { expect } from 'chai';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { EthereumService } from '../ethereum/ethereum.service';
import { Utils } from '../../common/utils';
import { constants } from '../../common/constants';
import { MockOrdersService } from '../../../test/MockOrderService';
import { MockEthereumService } from '../../../test/MockEthereumService';
import { MockLogger } from '../../../test/MockLogger';
import { AssetClass } from './order.types';

describe('Validation tests for the Create Order endpoint', () => {
  let app: INestApplication;
  let validOrder: any;
  let ordersController: OrdersController;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EthereumService)
      .useClass(MockEthereumService)
      .overrideProvider(OrdersService)
      .useClass(MockOrdersService)
      // turning off logging otherwise it's going to output a ton of exceptions!
      .setLogger(new MockLogger)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe()); // enabling DTO validation
    await app.init();

    ordersController = app.get<OrdersController>(OrdersController);

    // valid left order payload
    // @TODO add more cases for ERC721_BUNDLE
    validOrder = {
      type: 'UNIVERSE_V1',
      maker: '0xaaaaaaaaaabbbbbbbbbbccccccccccdddddddddd',
      make: {
        assetType: {
          assetClass: 'ERC721_BUNDLE',
          contracts: [
            '0x9999999999888888888877777777776666666666',
            '0x5555555555444444444433333333332222222222',
          ],
          tokenIds: [
            [1, 2, 3, 4],
            [1, 2, 3, 4],
          ],
        },
        value: '8',
      },
      taker: constants.ZERO_ADDRESS,
      take: {
        assetType: {
          assetClass: 'ETH',
        },
        value: '200',
      },
      salt: 6,
      start: 0,
      end: 0,
      data: {
        dataType: 'ORDER_DATA',
        revenueSplits: [
          {
            account: '0xaaaaaaaaaabbbbbbbbbbccccccccccdddddddddd',
            value: 1000,
          },
          {
            account: '0xaaaaaaaaaabbbbbbbbbbccccccccccdddddddddd',
            value: 2000,
          },
          {
            account: '0xaaaaaaaaaabbbbbbbbbbccccccccccdddddddddd',
            value: 2000,
          },
        ],
      },
      signature: 'signature',
    };
  });

  it(`should return make.assetType.assetClass must be a valid enum value`, async () => {
    const order = JSON.parse(JSON.stringify(validOrder));
    
    order.make.assetType.assetClass = 'non existing class';
    let response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array').that.includes('make.assetType.assetClass must be a valid enum value');
  
    order.make.assetType.assetClass = 'ERC721-right-junk';
    response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array').that.includes('make.assetType.assetClass must be a valid enum value');

    order.make.assetType.assetClass = 'left-junk-ERC721';
    response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array').that.includes('make.assetType.assetClass must be a valid enum value');
  });

  it(`should return make.assetType.Please provide a valid wallet address.`, async () => {
    const order = JSON.parse(JSON.stringify(validOrder));

    order.make.assetType.contracts[1] = 'junk-0xaaaaaaaaaabbbbbbbbbbccccccccccdddddddddd';
    const response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array').that.includes('make.assetType.Please provide a valid wallet address.');
  });

  it(`should return We had an error processing your request.`, async () => {
    const order = JSON.parse(JSON.stringify(validOrder));

    order.make.assetType.tokenIds[0] = [];
    order.make.assetType.tokenIds[1] = ['1', 'string', 9];
    const response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.a('string').that.equals('We had an error processing your request.');
  });

  it(`should return ${constants.INVALID_ORDER_TYPE_ERROR}`, async () => {
    const order = JSON.parse(JSON.stringify(validOrder))

    order.type = 'junk type';
    const response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.a('string').that.equals(constants.INVALID_ORDER_TYPE_ERROR);
  });

  it(`should return ${constants.WALLET_ADDRESS_ERROR}`, async () => {
    let order = JSON.parse(JSON.stringify(validOrder));
    
    order.maker = 'junk wallet address';
    let response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array').that.includes(constants.WALLET_ADDRESS_ERROR);

    order = JSON.parse(JSON.stringify(validOrder));
    order.taker = '0xaaaaaaaaaabbbbbbbbbbccccccccccdddddddddd-junk';
    response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array').that.includes(constants.WALLET_ADDRESS_ERROR);

    delete order.taker;
    response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array').that.includes(constants.WALLET_ADDRESS_ERROR);
  });

  it(`should return asset type errors`, async () => {
    const order = JSON.parse(JSON.stringify(validOrder));

    order.make.assetType.assetClass = AssetClass.ERC721;
    order.make.assetType.contract = 'junk-0xaaaaaaaaaabbbbbbbbbbccccccccccdddddddddd';
    order.make.assetType.tokenId = 'stringAndNumber777';
    order.make.assetType.junkField = 'junkValue';
    order.make.value = 555; 
    const response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array')
      .that
      .includes('make.assetType.Please provide a valid wallet address.')
      .and
      .includes('make.assetType.tokenId must be a number string')
      .and
      .includes('make.value must be a number string');
  });

  it(`should return Validation failed`, async () => {
    const order = JSON.parse(JSON.stringify(validOrder));

    order.make.assetType.junkField = 'junkValue';
    const response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.a('string').that.equals('Validation failed');
  });

  it(`should return salt`, async () => {
    let order = JSON.parse(JSON.stringify(validOrder));

    order.salt = '5';
    let response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array').that.includes('salt must be a number conforming to the specified constraints');

    order = JSON.parse(JSON.stringify(validOrder));

    delete order.salt;
    response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array').that.includes('salt should not be empty');
  });

  it(`should return signature, end and start`, async () => {
    const order = JSON.parse(JSON.stringify(validOrder));

    delete order.signature;
    order.end = 'string'
    order.start = 9999999999999999999999999;
    const response = await request(app.getHttpServer())
      .post('/orders/order/')
      .send(order)
      .expect(400);
    expect(response.body.message).to.be.an('array')
      .that
      .includes('signature should not be empty')
      .and
      .includes('end must be an integer number')
      .and
      .includes(`start must not be greater than ${constants.MAX_LISTING_TIMESTAMP}`);
  });

  afterAll(async () => {
    app.close();
  });
});
