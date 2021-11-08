export enum EthereumNetworkType {
  Mainnet = 'mainnet',
  Rinkeby = 'rinkeby',
  AWS = 'aws',
  Ropsten = 'ropsten',
}

export type NetworkType = keyof typeof EthereumNetworkType;
