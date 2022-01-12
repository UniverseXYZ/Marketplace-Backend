import { Injectable } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';
import Web3 from 'web3';
import { EthereumNetworkType, NetworkType } from './interface';
import R from 'ramda';
import Exchange from './exchange-contract';
import { BigNumber, ethers } from 'ethers';

@Injectable()
export class EthereumService {
  public web3: Web3;
  public exchange: any;

  constructor(private config: AppConfig) {
    const key = <NetworkType>config.values.ETHEREUM_NETWORK;

    const secret = R.path(['INFURA_PROJECT_SECRET'], config.values);
    const projectId = R.path(['INFURA_PROJECT_ID'], config.values);
    const url = `https://:${secret}@${EthereumNetworkType[key]}.infura.io/v3/${projectId}`;
    const provider = new Web3.providers.HttpProvider(url, {
      keepAlive: true,
      timeout: 30000,
    });

    if (R.isNil(url)) {
      throw new Error('[web3.providers]: the url is null or undefined');
    }

    this.web3 = new Web3(provider);
    const ethersProvider = new ethers.providers.InfuraProvider(
      EthereumNetworkType[key],
      R.path(['INFURA_PROJECT_ID'], config.values),
    );
    this.exchange = Exchange(
      ethersProvider,
      R.path(['MARKETPLACE_CONTRACT'], this.config.values),
    );
  }

  async verifySignature(message: string, signature: string) {
    const address = this.web3.eth.accounts.recover(message, signature);
    return address;
  }

  async prepareMatchTx(
    left: any,
    signatureLeft: string,
    right: any,
    from: string,
    value: string,
  ) {
    const tx = await this.exchange.populateTransaction.matchOrders(
      left,
      signatureLeft,
      right,
      '0x',
      {
        from,
        value,
      },
    );
    return tx;
  }

  /**
   * Calculate transaction value in case its a ETH order
   */
  calculateTxValue(
    makeClass: string,
    makeAmount: string,
    takeClass: string,
    takeAmount: string,
  ) {
    let value = BigNumber.from(0);
    if (makeClass === 'ETH') {
      value = BigNumber.from(makeAmount);
    } else if (takeClass === 'ETH') {
      value = BigNumber.from(takeAmount);
    }
    // if (value.gt(0)) {
    //   value = value.add(
    //     value
    //       .mul(R.path(['contracts', 'DaoFee'], this.config.values))
    //       .div(10000),
    //   );
    // }
    return value;
  }
}
