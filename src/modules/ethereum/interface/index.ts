export enum EthereumNetworkType {
  Mainnet = 'mainnet',
  Rinkeby = 'rinkeby',
  AWS = 'aws',
}

export type NetworkType = keyof typeof EthereumNetworkType;
