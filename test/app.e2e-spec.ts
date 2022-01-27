import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const { expect } = require("chai");
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { waffle, ethers, upgrades } from 'hardhat';
import { Order, Asset, sign } from './helpers/order';

const DAO_FEE = 2500;
const DAO_ADDRESS = "0x67b93852482113375666a310ac292D61dDD4bbb9";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_BUNDLE_SIZE = 10;
import {
  ETH,
  ERC20,
  ERC721_BUNDLE,
  ERC721,
  encodeToken,
  encodeBundleInfo,
} from './helpers/assets';

describe('End to end Match Orders tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.setTimeout(60000);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe()); // enabling DTO validation
    await app.init();
  });

  const { loadFixture } = waffle;

  const deployedContracts = async () => {
    const accounts = await ethers.getSigners();

    const TransferProxy = await ethers.getContractFactory("TransferProxy");
    const transferProxy = await upgrades.deployProxy(TransferProxy, [], {
      initializer: "__TransferProxy_init",
    });

    const ERC20TransferProxy = await ethers.getContractFactory(
      "ERC20TransferProxy"
    );
    const erc20TransferProxy = await upgrades.deployProxy(
      ERC20TransferProxy,
      [],
      {
        initializer: "__ERC20TransferProxy_init",
      }
    );

    const RoyaltiesRegistry = await ethers.getContractFactory('RoyaltiesRegistry');
    const royaltiesRegistry = await upgrades.deployProxy(
      RoyaltiesRegistry,
      [],
      {
        initializer: "__RoyaltiesRegistry_init",
      }
    );

    const UniverseMarketplace = await ethers.getContractFactory('UniverseMarketplace');

    const universeMarketplace = await upgrades.deployProxy(
      UniverseMarketplace,
      [
        transferProxy.address,
        erc20TransferProxy.address,
        DAO_FEE,
        DAO_ADDRESS,
        royaltiesRegistry.address,
        MAX_BUNDLE_SIZE,
      ],
      { initializer: "__UniverseMarketplace_init" }
    );

    const MockNFT = await ethers.getContractFactory("MockNFT");
    const MockNFTSecondaryFees = await ethers.getContractFactory('MockNFTSecondaryFees');
    const MockNFTERC2981Royalties = await ethers.getContractFactory('MockNFTERC2981Royalties');
    const MockToken = await ethers.getContractFactory("MockToken");

    const mockNFT = await MockNFT.deploy();
    const mockNFT2 = await MockNFT.deploy();
    const mockNFT3 = await MockNFTSecondaryFees.deploy();
    const mockNFT4 = await MockNFTERC2981Royalties.deploy();
    const mockToken = await MockToken.deploy(1000);

    await erc20TransferProxy.addOperator(universeMarketplace.address);
    await transferProxy.addOperator(universeMarketplace.address);
    await royaltiesRegistry.setRoyaltiesByToken(mockNFT.address, [
      [accounts[5].address, 1000],
      [accounts[6].address, 1000],
    ]);

    return {
      universeMarketplace,
      mockNFT,
      mockNFT2,
      mockNFT3,
      mockNFT4,
      mockToken,
      erc20TransferProxy,
      transferProxy,
      royaltiesRegistry,
    };
  };

  it('should create, encode, sign left ERC721_BUNDLE order, create & encode right order and Match', async () => {
    const {
      universeMarketplace, 
      mockNFT, 
      mockNFT2, 
      transferProxy 
    } = await loadFixture(deployedContracts);

    const accounts = await ethers.getSigners();

    for (let i = 0; i < 6; i++) {
      await mockNFT.connect(accounts[1]).mint("https://universe.xyz");
      await mockNFT.connect(accounts[1]).approve(transferProxy.address, i + 1);
      await mockNFT2.connect(accounts[1]).mint("https://universe.xyz");
      await mockNFT2.connect(accounts[1]).approve(transferProxy.address, i + 1);
    }

    const erc721Qunatity = 8;

    // get salt for new left order
    const leftOrderSaltResponse = await request(app.getHttpServer())
      .get('/orders/salt/' + accounts[1].address)
      .expect(200)

    // create left order
    let leftOrder: any = {
      type: 'UNIVERSE_V1',
      maker: accounts[1].address,
      make: {
        assetType: {
          assetClass: 'ERC721_BUNDLE',
          contracts: [
            mockNFT.address,
            mockNFT2.address,
          ],
          tokenIds: [
            [1, 2, 3, 4, 5, 6],
            [1, 2, 3, 4, 5, 6],
          ] 
        },
        value: erc721Qunatity,
      },
      taker: ZERO_ADDRESS,
      take: {
        assetType: {
          assetClass: 'ETH'
        },
        value: 200
      },
      salt: leftOrderSaltResponse.body.salt,
      start: 0,
      end: 0,
      dataType: '0x0b35c423', // @TODO find out what is it
      data: {
        dataType: 'ORDER_DATA',
        revenueSplits: [
          {
            account: accounts[2].address,
            value: 1000,
          },
          {
            account: accounts[3].address,
            value: 2000,
          },
          {
            account: accounts[4].address,
            value: 2000,
          },
        ]
      }
    };

    // encode left order using backend
    const encodeLeftOrderResponse = await request(app.getHttpServer())
      .post('/orders/encoder/order')
      .send(leftOrder)
      .expect(201); // 201 - Created response

    // sign encoded left order
    const leftOrderSignature = await sign(
      encodeLeftOrderResponse.body,
      accounts[1],
      universeMarketplace.address
    );

    // submit left order to backend
    leftOrder.signature = leftOrderSignature;
    const createLeftOrderResponse = await request(app.getHttpServer())
      .post('/orders/order')
      .send(leftOrder)
      .expect(201);
      
    // retrieve left order from backend
    const retrieveLeftOrderResponse = await request(app.getHttpServer())
      .get('/orders/' + createLeftOrderResponse.body.hash)
      .expect(200);
    expect(retrieveLeftOrderResponse.body).to.have.property('maker');
    expect(retrieveLeftOrderResponse.body.maker).to.equal(accounts[1].address.toLowerCase());

    // get salt for new right order
    const rightOrderSaltResponse = await request(app.getHttpServer())
    .get('/orders/salt/' + accounts[0].address)
    .expect(200)

    // create right order
    let rightOrder: any = {
      type: 'UNIVERSE_V1',
      maker: accounts[0].address,
      make: {
        assetType: {
          assetClass: 'ETH'
        },
        value: 200
      },
      taker: ZERO_ADDRESS,
      take: {
        assetType: {
          assetClass: 'ERC721_BUNDLE',
          contracts: [
            mockNFT.address,
            mockNFT2.address,
          ],
          tokenIds: [
            [1, 2, 3, 4, 5, 6],
            [1, 2, 3, 4, 5, 6],
          ] 
        },
        value: erc721Qunatity,
      },
      salt: rightOrderSaltResponse.body.salt,
      start: 0,
      end: 0,
      dataType: '0xffffffff',
      data: {
        dataType: '0x',
      }
    }

    // encode right order using backend
    const encodeRightOrderResponse = await request(app.getHttpServer())
      .post('/orders/encoder/order')
      .send(rightOrder)
      .expect(201);

    // match orders
    await expect(
      universeMarketplace
        .connect(accounts[0])
        .matchOrders(encodeLeftOrderResponse.body, leftOrderSignature, encodeRightOrderResponse.body, '0x', {
          value: 200,
        })
    ).to.be.emit(universeMarketplace, 'Match');

  })

  afterAll(async () => {
    app.close();
  });
});
