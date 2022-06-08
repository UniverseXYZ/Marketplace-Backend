import { FallbackProvider } from '@ethersproject/providers';
import { IEthereumService } from 'src/modules/ethereum/interface/IEthereumService';
import { AssetClass } from '../src/modules/orders/order.types';

export class MockEthereumService implements IEthereumService {
  ether: FallbackProvider;
  exchange: any;

  getChainId(): number {
    throw new Error('Method not implemented.');
  }

  prepareMatchTx(
    left: any,
    signatureLeft: string,
    right: any,
    from: string,
    value: string,
  ) {
    throw new Error('Method not implemented.');
  }

  calculateTxValue(
    makeClass: string,
    makeAmount: string,
    takeClass: string,
    takeAmount: string,
  ) {
    throw new Error('Method not implemented.');
  }

  public verifyTypedData(domain, types, value, signature): string {
    throw new Error('Method not implemented.');
  }

  public async verifyAllowance(
    assetClass: AssetClass,
    walletAddress: string,
    contractAddresses: string[],
    tokenIds: string[][],
    amount = '0',
  ): Promise<boolean> {
    return true;
  }
}
