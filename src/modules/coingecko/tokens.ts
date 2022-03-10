import { constants } from './../../common/constants/index';
export enum TOKENS {
  ETH = 'ethereum',
  WETH = 'weth',
  DAI = 'dai',
  XYZ = 'universe-xyz',
  USDC = 'usd-coin',
}

export const DEV_TOKEN_ADDRESSES: { [key in TOKENS]: string } = {
  [TOKENS.ETH]: constants.ZERO_ADDRESS,
  [TOKENS.WETH]: '0xc778417e063141139fce010982780140aa0cd5ab',
  [TOKENS.DAI]: '0x308a025592d230f997330E45E0D5a705cf8A0556',
  [TOKENS.XYZ]: '0x5F5C23FBf069E6C2B1D778FDE3Ee2FD9FD4A553F',
  [TOKENS.USDC]: '0x81B5Be5957dEAd02105CbDb389a3A7a25Aa925ec',
};

export const PROD_TOKEN_ADDRESSES: { [key in TOKENS]: string } = {
  [TOKENS.ETH]: constants.ZERO_ADDRESS,
  [TOKENS.WETH]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  [TOKENS.DAI]: '0x6b175474e89094c44da98b954eedeac495271d0f',
  [TOKENS.XYZ]: '0x618679dF9EfCd19694BB1daa8D00718Eacfa2883',
  [TOKENS.USDC]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
};

export const TOKEN_DECIMALS: { [key in TOKENS]: number } = {
  [TOKENS.ETH]: 18,
  [TOKENS.WETH]: 18,
  [TOKENS.DAI]: 18,
  [TOKENS.XYZ]: 18,
  //USDC Rinkeby Token has 18 decimals, mainnet has 6
  [TOKENS.USDC]: process.env.ETHEREUM_CHAIN_ID === '1' ? 6 : 18,
};
