import { CreateOrderDto } from 'src/modules/orders/order.dto';
import { AssetClass, OrderSide } from 'src/modules/orders/order.types';

export const validSalt = 0;
export const maker = '0x6FB3946CCc1a4b04FE49ce3e591C15f496C73881';

export const validSellETHOrder: any = {
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

export const invalidETHAssetClassSellETHOrder: any = {
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

export const validSellERC20Order: any = {
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

export const validBuyERC20Order: any = {
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

export const createOrderDto: CreateOrderDto = {
  salt: 1,
  signature: 'test-sig',
  start: 0,
  end: 0,
  maker: '0x11',
  taker: '0x12',
  make: {
    assetType: {
      assetClass: AssetClass.ERC721,
      contracts: ['123'],
      contract: '312',
      tokenId: '1',
      tokenIds: [['1'], ['2']],
    },
    value: '10',
  },
  take: {
    assetType: {
      assetClass: AssetClass.ERC20,
      contracts: ['987'],
      contract: '789',
      tokenId: '99',
      tokenIds: [['55'], ['54']],
    },
    value: '17',
  },
  type: 'test',
  data: {
    dataType: 'test-type',
  },
};
