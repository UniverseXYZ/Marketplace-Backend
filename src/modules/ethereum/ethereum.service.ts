import { Injectable } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';
import Web3 from 'web3';

@Injectable()
export class EthereumService {
  public web3: Web3;

  constructor(private config: AppConfig) {
    const network = config.values.ethereum.ethereumNetwork;
    const url = `https://:${config.values.ethereum.infuraProjectSecret}@${network}.infura.io/v3/${config.values.ethereum.infuraProjectId}`;
    const web3Provider = new Web3.providers.HttpProvider(url, {
      keepAlive: true,
      timeout: 30000,
    });
    this.web3 = new Web3(web3Provider);
  }

  async verifySignature(message: string, signature: string) {
    const address = this.web3.eth.accounts.recover(message, signature);
    return address;
  }
}
