import { ethers } from 'ethers';
import { AssetClass } from 'src/modules/orders/order.types';

export const ETHEREUM_SERVICE = 'ETHEREUM SERVICE';

export interface IEthereumService {
  ether: ethers.providers.FallbackProvider;

  exchange: any;

  getChainId(): number;

  verifyTypedData(domain, types, value, signature): string;

  prepareMatchTx(
    left: any,
    signatureLeft: string,
    right: any,
    from: string,
    value: string,
  );

  calculateTxValue(
    makeClass: string,
    makeAmount: string,
    takeClass: string,
    takeAmount: string,
  );

  verifyAllowance(
    assetClass: AssetClass,
    walletAddress: string,
    contractAddresses: string[],
    tokenIds: string[][],
    amount: string,
  ): Promise<boolean>;
}
