import { IAsset } from '../modules/orders/order.types';
import {
  encodeAsset,
  encodeAssetClass,
  encodeBundle,
  encodeOrderData,
  hashAsset,
  hashAssetType,
  hashOrderKey,
} from './order-encoder';

test('utils.orderEncoder -> encodeAsset(ERC721)', () => {
  const encodedAsset = encodeAsset(
    '0x04dCA48CBFd79287686F3Db03DC4EFEbC5266677',
    5,
  );
  expect(encodedAsset).toBe(
    '0x00000000000000000000000004dca48cbfd79287686f3db03dc4efebc52666770000000000000000000000000000000000000000000000000000000000000005',
  );
});

test('utils.orderEncoder -> encodeAsset(ERC20)', () => {
  const encodedAsset = encodeAsset(
    '0x350a9180ed984E12Fe6CfB244E2A86E6C51E17B1',
  );
  expect(encodedAsset).toBe(
    '0x000000000000000000000000350a9180ed984e12fe6cfb244e2a86e6c51e17b1',
  );
});

test('utils.orderEncoder -> encodeAssetClass()', () => {
  const encoded = encodeAssetClass('ERC721');
  expect(encoded).toBe('0x73ad2146');
});

test('utils.orderEncoder -> encodeAssetClass(ORDER_DATA)', () => {
  const encoded = encodeAssetClass('ORDER_DATA');
  expect(encoded).toBe('0x0b35c423');
});

test('utils.orderEncoder -> encodeBundle() 2 tokens', () => {
  const tokens = [
    '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1',
    '0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44',
  ];
  const tokenIds = [
    [1, 2, 3],
    [1, 2, 3],
  ];
  const encoded = encodeBundle(tokens, tokenIds);
  expect(encoded).toBe(
    '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001000000000000000000000000004ed7c70f96b99c776995fb64377f0d4ab3b0e1c100000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003000000000000000000000000322813fd9a801c5507c9de605d63cea4f2ce6c4400000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003',
  );
});

test('utils.orderEncoder -> encodeBundle() 1 token', () => {
  const tokens = ['0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1'];
  const tokenIds = [[1, 2, 3]];
  const encoded = encodeBundle(tokens, tokenIds);
  expect(encoded).toBe(
    '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000004ed7c70f96b99c776995fb64377f0d4ab3b0e1c100000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003',
  );
});

test('utils.orderEncoder -> encodeOrder()', () => {
  // const paymentSplit = [
  //   ['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 1000],
  //   ['0x90F79bf6EB2c4f870365E785982E1f101E93b906', 2000],
  //   ['0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', 2000],
  // ];
  const orderData = {
    revenueSplits: [
      {
        account: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        value: '1000',
      },
      {
        account: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        value: '2000',
      },
      {
        account: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        value: '2000',
      },
    ],
  };
  const encoded = encodeOrderData(orderData.revenueSplits);
  expect(encoded).toBe(
    '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000030000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc00000000000000000000000000000000000000000000000000000000000003e800000000000000000000000090f79bf6eb2c4f870365e785982e1f101e93b90600000000000000000000000000000000000000000000000000000000000007d000000000000000000000000015d34aaf54267db7d7c367839aaf71a00a2c6a6500000000000000000000000000000000000000000000000000000000000007d0',
  );
});

test('utils.orderEncoder -> hashOrder', () => {
  const makeAsset: IAsset = {
    assetType: {
      assetClass: 'ERC721',
      contract: '0x04dCA48CBFd79287686F3Db03DC4EFEbC5266677',
      tokenId: 4,
    },
    value: '1',
  };
  const takeAsset: IAsset = {
    assetType: {
      assetClass: 'ERC20',
      contract: '0x350a9180ed984E12Fe6CfB244E2A86E6C51E17B1',
    },
    value: '10000000000000000000',
  };

  const encoded = hashOrderKey(
    '0xa035F2A1fC34fec7EfbD2E9cA2d567c5Cc001d91',
    makeAsset.assetType,
    takeAsset.assetType,

    1,
  );
  expect(encoded).toEqual(
    '0x989e197b09d973f4d1df74d7b89041f252b196092ada000f103a61404060a406',
  );
});

test('utils.orderEncoder -> hashOrder(ETH)', () => {
  const makeAsset: IAsset = {
    assetType: {
      assetClass: 'ERC721',
      contract: '0x04dCA48CBFd79287686F3Db03DC4EFEbC5266677',
      tokenId: 6,
    },
    value: '1',
  };
  const takeAsset: IAsset = {
    assetType: {
      assetClass: 'ETH',
    },
    value: '1200000000000000000',
  };

  const encoded = hashOrderKey(
    '0xe1d7a59ab392ea29b059dae31c5a573e2fecc5a8',
    makeAsset.assetType,
    takeAsset.assetType,
    1,
  );
  expect(encoded).toEqual(
    '0xdc2e07069d4ef56d6c60c2849b05287669c100b74312032b594fe75562054543',
  );
});

test('utils.orderEncoder -> hashOrder(Bundle)', () => {
  const makeAsset: IAsset = {
    assetType: {
      assetClass: 'ERC721_BUNDLE',
      contracts: ['0x78c3E13fdDC49f89feEB54C3FC47d7df611FA9BE'],
      tokenIds: [[3, 4]],
    },
    value: '2',
  };
  const takeAsset: IAsset = {
    assetType: {
      assetClass: 'ETH',
    },
    value: '200000000000000000',
  };

  const encoded = hashOrderKey(
    '0xE1d7a59AB392EA29b059dAE31c5A573e2fEcC5A8',
    makeAsset.assetType,
    takeAsset.assetType,
    4,
  );
  expect(encoded).toEqual(
    '0x5f2775154acbf4c646844d8da9dd29e0d462b3abeb13000f7558ae41a5b205b9',
  );
});

test('utils.orderEncoder -> hashAssetType', () => {
  const makeAsset: IAsset = {
    assetType: {
      assetClass: 'ERC721',
      contract: '0x04dCA48CBFd79287686F3Db03DC4EFEbC5266677',
      tokenId: 5,
    },
    value: '1',
  };

  const encoded = hashAssetType(makeAsset.assetType);
  expect(encoded).toEqual(
    '0xf53cf6a169726bb9d0489168139ef4c99572f27477fcb20d7547cc9c4ea934ff',
  );
});

test('utils.orderEncoder -> hashAsset', () => {
  const makeAsset: IAsset = {
    assetType: {
      assetClass: 'ERC721',
      contract: '0x04dCA48CBFd79287686F3Db03DC4EFEbC5266677',
      tokenId: 5,
    },
    value: '1',
  };

  const encoded = hashAsset(makeAsset);
  expect(encoded).toEqual(
    '0xb97ceaabaf68dfa55dcd7239443600869800a5a66e29cb57515fcfeccccd66d5',
  );
});
