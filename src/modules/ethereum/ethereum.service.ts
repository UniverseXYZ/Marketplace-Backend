import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';
import Web3 from 'web3';
import { EthereumNetworkType, NetworkType } from './interface';
import R from 'ramda';
import Exchange from './exchange-contract';
import { BigNumber, ethers } from 'ethers';
import { constants } from '../../common/constants';
import { Utils } from '../../common/utils';

@Injectable()
export class EthereumService {
  public web3: Web3;
  public exchange: any;
  private logger;
  private chainId: number;

  constructor(private config: AppConfig) {
    this.logger = new Logger(EthereumService.name);

    const key = <NetworkType>config.values.ETHEREUM_NETWORK;
    const secret = R.path(['INFURA_PROJECT_SECRET'], config.values);
    const projectId = R.path(['INFURA_PROJECT_ID'], config.values);
    const url = `https://:${secret}@${EthereumNetworkType[key]}.infura.io/v3/${projectId}`;
    if (R.isNil(url)) {
      throw new Error('[web3.providers]: the url is null or undefined');
    }
    const provider = new Web3.providers.HttpProvider(url, {
      keepAlive: true,
      timeout: 30000,
    });

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

  /**
   * Returns current ethereum chain id.
   * @returns
   */
  public async getChainId(): Promise<number> {
    if(!this.chainId) {
      this.chainId = await this.web3.eth.getChainId();
    }
    return this.chainId;
  }

  /**
   * @deprecated
   * @TODO to delete
   * @param message 
   * @param signature 
   * @returns 
   */
  public async verifySignature(message: string, signature: string) {
    // const address1 = this.web3.eth.accounts.recover(message, signature);
    const address = ethers.utils.verifyMessage(message, signature);
    return address;
  }

  /**
   * Returns the address that signed the EIP-712 value for the domain and types 
   * to produce the signature.
   * @param {Object} domain 
   * @param {Object} types 
   * @param {Object} value - encoded order
   * @param {string} signature 
   * @returns {string}
   */
  public verifyTypedData(domain, types, value, signature ): string {
    return ethers.utils.verifyTypedData(domain, types, value, signature);
  }

  public async prepareMatchTx(
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
  public calculateTxValue(
    makeClass: string,
    makeAmount: string,
    takeClass: string,
    takeAmount: string,
  ) {
    let value = BigNumber.from(0);
    // @TODO check with Ryan and @Stan that make's asset class == ETH is not a bug but feature!
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

  // public async sign(order, walletAddress, verifyingContract) {
  //   return await Utils.sign(order, walletAddress, verifyingContract, this.web3);
  // }

  public async verifyAllowance(walletAddress: string, contractAddresses: string[], tokenIds: number[][]): Promise<boolean> {
    let value = false;

    walletAddress = walletAddress.toLowerCase();
    const nftContractABI = [
      {
        inputs: [
          {
            internalType: 'uint256',
            name: 'tokenId',
            type: 'uint256',
          }
        ],
        outputs: [
          {
            // internalType: '',
            name: 'getApproved',
            type: 'address',
          }
        ],
        name: 'getApproved',
        type: 'function',
      },
      {
        inputs: [
          {
            internalType: 'address',
            name: 'owner',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'operator',
            type: 'address',
          }
        ],
        outputs: [
          {
            // internalType: '',
            name: 'isApprovedForAll',
            type: 'bool',
          }
        ],
        name: 'isApprovedForAll',
        type: 'function',
      },
      {
        inputs: [
          {
            internalType: 'uint256',
            name: 'tokenId',
            type: 'uint256',
          }
        ],
        outputs: [
          {
            // internalType: '',
            name: 'ownerOf',
            type: 'address',
          }
        ],
        name: 'ownerOf',
        type: 'function',
      }
    ] as any;
    let nftContracts = {};

    try {
      for(let i = 0 ; i < contractAddresses.length ; i++) {
        const contractAddress = contractAddresses[i];
        
        if(!constants.REGEX_ETHEREUM_ADDRESS.test(contractAddress)) {
          throw new Error(`Invalid contract address ${contractAddress}.`);
        }

        if(!nftContracts[contractAddress]) {
          nftContracts[contractAddress] = new this.web3.eth.Contract(nftContractABI, contractAddress);
        }
        
        for(let j = 0 ; j < tokenIds[i].length ; j++) {
          const tokenId = Math.floor(tokenIds[i][j]); // force integer

          this.logger.log(`Calling ownerOf() on contract ${contractAddress} with tokenId ${tokenId}.`);
          const owner = await nftContracts[contractAddress].methods.ownerOf(tokenId).call();
          if(owner.toLowerCase() !== walletAddress) {
            throw new Error(`Wallet ${walletAddress} is not the owner of token id ${tokenId} on contract ${contractAddress}.`);
          }
          
          this.logger.log(`Calling isApprovedForAll() on contract ${contractAddress}.`);
          const isApprovedForAll = await nftContracts[contractAddress].methods.isApprovedForAll(walletAddress, this.config.values.MARKETPLACE_CONTRACT).call();           
          if(!isApprovedForAll) {
            this.logger.log(`Calling getApproved() on contract ${contractAddress} with tokenId ${tokenId}.`);
            const approvedAddress = await nftContracts[contractAddress].methods.getApproved(tokenId).call();             
            if(approvedAddress.toLowerCase() !== this.config.values.MARKETPLACE_CONTRACT) {
              throw new Error(`Token id ${tokenId} on contract ${contractAddress} is not approved to be transferred to the Marketplace contract.`);
            }
          }
        }
      }

      value = true; //true if successfully reached this line.

    } catch(e) {
      value = false;
      this.logger.error(e);
      this.logger.error(`Unable to verify allowance for wallet ${walletAddress}`);
    }
      
    return value;
  }
}
