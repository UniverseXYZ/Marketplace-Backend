import { Injectable } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';
import Web3 from 'web3';
import AWSHttpProvider from '@aws/web3-http-provider';
import { EthereumNetworkType, NetworkType } from './interface';
import R from 'ramda';
import { provider } from 'web3-core';
@Injectable()
export class EthereumService {
  public web3: Web3;

  constructor(private config: AppConfig) {
    const key = <NetworkType>config.values.ethereum.ethereumNetwork;
    let url = undefined;
    let provider: provider;

    if (EthereumNetworkType[key] === 'aws') {
      const credentials = {
        accessKeyId: R.path(['aws', 'AWS_ACCESS_KEY_ID'], config.values),
        secretAccessKey: R.path(
          ['aws', 'AWS_SECRET_ACCESS_KEY'],
          config.values,
        ),
      };
      const nodeId = R.path(['aws', 'nodeId'], config.values);
      const endpoint = R.path(['aws', 'httpEndpoint'], config.values);
      url = `https://${nodeId}.${endpoint}`;
      provider = new AWSHttpProvider(url, credentials);
    } else {
      const secret = R.path(['ethereum', 'infuraProjectSecret'], config.values);
      const projectId = R.path(['ethereum', 'infuraProjectId'], config.values);
      url = `https://:${secret}@${EthereumNetworkType[key]}.infura.io/v3/${projectId}`;
      provider = new Web3.providers.HttpProvider(url, {
        keepAlive: true,
        timeout: 30000,
      });
    }

    if (R.isNil(url)) {
      throw new Error('[web3.providers]: the url is null or undefined');
    }

    this.web3 = new Web3(provider);
  }

  async verifySignature(message: string, signature: string) {
    const address = this.web3.eth.accounts.recover(message, signature);
    return address;
  }
}
