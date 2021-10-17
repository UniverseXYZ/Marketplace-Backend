import Web3 from 'web3';
import { singleton } from 'ts-singleton';

export enum NetworkEnum {
  Mainnet = 'mainnet',
  Rinkeby = 'rinkeby',
}

type NetworkType = keyof typeof NetworkEnum;

export interface IWeb3Service {
  network: NetworkType;
  projectId: string;
  secret: string;
}

@singleton
export class Web3Service {
  private wb: Web3;

  constructor(payload: IWeb3Service) {
    const url = `https://:${payload.secret}@${payload.network}.infura.io/v3${payload.projectId}`;
    const provider = new Web3.providers.HttpProvider(url, {
      keepAlive: true,
      timeout: 30000,
    });
    this.wb = new Web3(provider);
  }

  public get web3(): Web3 {
    return this.wb;
  }
}
