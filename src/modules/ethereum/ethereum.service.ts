import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';
import Web3 from 'web3';
import { EthereumNetworkType, NetworkType } from './interface';
import R from 'ramda';
import Exchange from './exchange-contract';
import { BigNumber, ethers } from 'ethers';
import { constants } from '../../common/constants';
import { Utils } from '../../common/utils';
// import { MulticallService } from '../multicall/multicall.service';
import { nftContractABI } from './abi/nft-contract';
import { erc20ContractABI } from './abi/erc20-contract';
import { erc1155ContractABI } from './abi/erc1155-contract';
import { AssetClass } from '../orders/order.types';
import { IEthereumService } from './interface/IEthereumService';

@Injectable()
export class EthereumService implements IEthereumService {
  public ether: ethers.providers.FallbackProvider;
  public exchange: any;
  private readonly logger = new Logger(EthereumService.name);

  constructor(
    private config: AppConfig, // private multicallService: MulticallService
  ) {
    const network = <NetworkType>config.values.ETHEREUM_NETWORK;
    const quorum: number = R.path(['ETHEREUM_QUORUM'], config.values);

    const projectSecret = R.path(['INFURA_PROJECT_SECRET'], config.values);
    const projectId = R.path(['INFURA_PROJECT_ID'], config.values);
    const infuraProvider: ethers.providers.InfuraProvider =
      projectId && projectSecret
        ? new ethers.providers.InfuraProvider(network, {
            projectId: projectId,
            projectSecret: projectSecret,
          })
        : undefined;

    const alchemyToken: string = R.path(['ALCHEMY_TOKEN'], config.values);
    const alchemyProvider: ethers.providers.AlchemyProvider = alchemyToken
      ? new ethers.providers.AlchemyProvider(network, alchemyToken)
      : undefined;

    const chainstackUrl: string = R.path(['CHAINSTACK_URL'], config.values);
    const chainStackProvider: ethers.providers.JsonRpcProvider = chainstackUrl
      ? new ethers.providers.JsonRpcProvider(chainstackUrl, network)
      : undefined;

    const quicknodeUrl: string = R.path(['QUICKNODE_URL'], config.values);
    const quicknodeProvider: ethers.providers.JsonRpcProvider = quicknodeUrl
      ? new ethers.providers.JsonRpcProvider(quicknodeUrl, network)
      : undefined;

    if (
      !quorum ||
      (!infuraProvider &&
        !alchemyProvider &&
        !chainStackProvider &&
        !quicknodeProvider)
    ) {
      throw new Error(
        'Quorum or Infura project id or secret or alchemy token or chainstack url is not defined',
      );
    }

    const allProviders: ethers.providers.BaseProvider[] = [
      infuraProvider,
      alchemyProvider,
      chainStackProvider,
      quicknodeProvider,
    ];
    const definedProviders: ethers.providers.BaseProvider[] =
      allProviders.filter((x) => x !== undefined);
    const ethersProvider: ethers.providers.FallbackProvider =
      new ethers.providers.FallbackProvider(definedProviders, quorum);

    this.ether = ethersProvider;
    this.exchange = Exchange(
      ethersProvider,
      R.path(['MARKETPLACE_CONTRACT'], this.config.values),
    );

    this.logger.log(
      `Started ethers service with ${definedProviders.length} out of ${allProviders.length} Fallback Providers. Configured quorum: ${quorum}`,
    );
  }

  /**
   * Returns current ethereum chain id.
   * @returns
   */
  public getChainId(): number {
    return Number(this.config.values.ETHEREUM_CHAIN_ID);
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
  public verifyTypedData(domain, types, value, signature): string {
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

  /**
   * This method calls allowance verification methods depending on the asset class (ERC721, ERC20 etc)
   * @param assetClass - value of type AssetClass
   * @param walletAddress
   * @param contractAddresses
   * @param tokenIds
   * @param amount - this is the order value for ERC20 orders
   * @returns
   */
  public async verifyAllowance(
    assetClass: AssetClass,
    walletAddress: string,
    contractAddresses: string[],
    tokenIds: string[][],
    amount = '0',
  ): Promise<boolean> {
    let value = false;
    walletAddress = walletAddress.toLowerCase();

    switch (assetClass) {
      case AssetClass.ERC721:
      case AssetClass.ERC721_BUNDLE:
        value = await this.verifyAllowanceERC721(
          walletAddress,
          contractAddresses,
          tokenIds,
        );
        break;
      case AssetClass.ERC20:
        value = await this.verifyAllowanceERC20(
          walletAddress,
          contractAddresses[0],
          amount,
        );
        break;
      case AssetClass.ERC1155:
        value = await this.verifyAllowanceERC1155(
          walletAddress,
          contractAddresses[0],
          tokenIds[0][0],
          amount,
        );
        break;
    }

    return value;
  }

  /**
   * This method verifies "allowance" of the walletAddress on a ERC721 (or ERC721_BUNDLE) contracts
   * by calling isApprovedForAll(), getApproved() and ownerOf() o the contract to verify that
   * the Marketplace contract is approved to make transfers and the walletAddress actually owns
   * the token.
   * @param walletAddress
   * @param contractAddresses
   * @param tokenIds
   * @returns {Promise<boolean>}
   */
  private async verifyAllowanceERC721(
    walletAddress: string,
    contractAddresses: string[],
    tokenIds: string[][],
  ): Promise<boolean> {
    let value = false;
    const nftContracts = {};

    try {
      for (let i = 0; i < contractAddresses.length; i++) {
        const contractAddress = contractAddresses[i];

        if (!constants.REGEX_ETHEREUM_ADDRESS.test(contractAddress)) {
          throw new Error(`Invalid contract address ${contractAddress}.`);
        }

        if (!nftContracts[contractAddress]) {
          nftContracts[contractAddress] = new ethers.Contract(
            contractAddress,
            nftContractABI,
            this.ether,
          );
        }

        this.logger.log(
          `Calling isApprovedForAll() on ERC721 contract ${contractAddress}.`,
        );
        const isApprovedForAll = await nftContracts[
          contractAddress
        ].isApprovedForAll(
          walletAddress,
          this.config.values.MARKETPLACE_CONTRACT,
        );

        for (let j = 0; j < tokenIds[i].length; j++) {
          const tokenId = tokenIds[i][j]; // tokenId is a string!
          if (isNaN(Number(tokenId))) {
            throw new Error(`tokenId ${tokenId} is invalid.`);
          }

          if (true !== isApprovedForAll) {
            this.logger.log(
              `Calling getApproved() on ERC721 contract ${contractAddress} with tokenId ${tokenId}.`,
            );
            const approvedAddress = await nftContracts[
              contractAddress
            ].getApproved(tokenId);
            if (
              approvedAddress.toLowerCase() !==
              this.config.values.MARKETPLACE_CONTRACT.toLowerCase()
            ) {
              throw new Error(
                `Token id ${tokenId} on contract ${contractAddress} is not approved to be transferred to the Marketplace contract.`,
              );
            }
          }

          this.logger.log(
            `Calling ownerOf() on ERC721 contract ${contractAddress} with tokenId ${tokenId}.`,
          );
          const owner = await nftContracts[contractAddress].ownerOf(tokenId);
          if (owner.toLowerCase() !== walletAddress) {
            throw new Error(
              `Wallet ${walletAddress} is not the owner of token id ${tokenId} on contract ${contractAddress}.`,
            );
          }
        }
      }

      value = true; //true if successfully reached this line.
    } catch (e) {
      value = false;
      this.logger.error(e);
      this.logger.error(
        `Unable to verify allowance for wallet ${walletAddress}`,
      );
    }

    return value;
  }

  /**
   * This method verifies "allowance" of the walletAddress on a ERC20 contract by calling
   * allowance() and balanceOf() methods on the contract contractAddress to see if the
   * Marketplace contract is allowed to make transfers of tokens on this contract and
   * that the walletAddress actually owns at least the amount of tokens on this contract.
   * @param walletAddress
   * @param contractAddress
   * @param amount
   * @returns {Promise<boolean>}
   */
  private async verifyAllowanceERC20(
    walletAddress: string,
    contractAddress: string,
    amount: string,
  ): Promise<boolean> {
    let value = false;

    try {
      if (!constants.REGEX_ETHEREUM_ADDRESS.test(contractAddress)) {
        throw new Error(`Invalid contract address ${contractAddress}.`);
      }
      if (Number(amount) <= 0) {
        throw new Error(`Invalid amount value ${amount}.`);
      }

      const erc20Contract = new ethers.Contract(
        contractAddress,
        erc20ContractABI,
        this.ether,
      );

      this.logger.log(
        `Calling allowance() on ERC20 contract ${contractAddress} with wallet address ${walletAddress} and Marketplace contract.`,
      );
      const allowance = await erc20Contract.allowance(
        walletAddress,
        this.config.values.MARKETPLACE_CONTRACT,
      );
      if (BigInt(amount) > allowance) {
        throw new Error(
          `Marketplace contract does not have enough allowance of ${amount}, got ${allowance}`,
        );
      }

      this.logger.log(
        `Calling balanceOf() on ERC20 contract ${contractAddress} with wallet ${walletAddress}.`,
      );
      const balance = await erc20Contract.balanceOf(walletAddress);
      if (BigInt(amount) > balance) {
        throw new Error(
          `Wallet ${walletAddress} does not have enough balance of ${amount}, got ${balance}`,
        );
      }

      value = true;
    } catch (e) {
      value = false;
      this.logger.error(e);
      this.logger.error(
        `Unable to verify allowance for wallet ${walletAddress} on ERC20 contract ${contractAddress}.`,
      );
    }

    return value;
  }

  /**
   * This method verifies "allowance" of the walletAddress on a ERC1155 contract by calling
   * isApprovedForAll() and balanceOf() methods on the contract contractAddress to see if the
   * Marketplace contract is allowed to make transfers of tokenId on this contract and
   * that the walletAddress actually owns at least the amount of tokenId on this contract.
   * @param walletAddress
   * @param contractAddress
   * @param tokenId
   * @param amount
   * @returns {Promise<boolean>}
   */
  private async verifyAllowanceERC1155(
    walletAddress: string,
    contractAddress: string,
    tokenId: string,
    amount: string,
  ): Promise<boolean> {
    let value = false;

    try {
      if (!constants.REGEX_ETHEREUM_ADDRESS.test(contractAddress)) {
        throw new Error(`Invalid contract address ${contractAddress}.`);
      }
      if (Number(amount) <= 0) {
        throw new Error(`Invalid amount value ${amount}.`);
      }
      if (isNaN(Number(tokenId))) {
        throw new Error(`tokenId ${tokenId} is invalid.`);
      }

      const erc1155Contract = new ethers.Contract(
        contractAddress,
        erc1155ContractABI,
        this.ether,
      );

      this.logger.log(
        `Calling isApprovedForAll() on ERC1155 contract ${contractAddress} with wallet address ${walletAddress} and Marketplace contract.`,
      );
      const isApprovedForAll = await erc1155Contract.isApprovedForAll(
        walletAddress,
        this.config.values.MARKETPLACE_CONTRACT,
      );
      if (true !== isApprovedForAll) {
        throw new Error(
          `Marketplace contract is not approved to transfer token ${tokenId} on contract ${contractAddress}.`,
        );
      }

      this.logger.log(
        `Calling balanceOf() on ERC1155 contract ${contractAddress} with wallet ${walletAddress} and token ${tokenId}.`,
      );
      const balance = await erc1155Contract.balanceOf(walletAddress, tokenId);
      if (BigInt(amount) > balance) {
        throw new Error(
          `Wallet ${walletAddress} does not have enough balance of ${amount} on token ${tokenId}, got ${balance}`,
        );
      }
    } catch (e) {
      value = false;
      this.logger.error(e);
      this.logger.error(
        `Unable to verify allowance for wallet ${walletAddress} on ERC1155 contract ${contractAddress}.`,
      );
    }

    return value;
  }
}
