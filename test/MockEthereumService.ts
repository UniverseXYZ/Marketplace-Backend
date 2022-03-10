import { EthereumService } from '../src/modules/ethereum/ethereum.service';
import { AssetClass } from '../src/modules/orders/order.types';

export class MockEthereumService extends EthereumService {
  public verifyTypedData(domain, types, value, signature): string {
    return '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
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
