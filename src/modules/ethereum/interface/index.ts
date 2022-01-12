export enum EthereumNetworkType {
  mainnet = 'mainnet',
  rinkeby = 'rinkeby',
  aws = 'aws',
  ropsten = 'ropsten',
}

export type NetworkType = keyof typeof EthereumNetworkType;
