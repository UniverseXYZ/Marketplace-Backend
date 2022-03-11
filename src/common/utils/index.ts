import * as EIP712 from './EIP712';

export class Utils {
  public static types = {
    AssetType: [
      { name: 'assetClass', type: 'bytes4' },
      { name: 'data', type: 'bytes' },
    ],
    Asset: [
      { name: 'assetType', type: 'AssetType' },
      { name: 'value', type: 'uint256' },
    ],
    Order: [
      { name: 'maker', type: 'address' },
      { name: 'makeAsset', type: 'Asset' },
      { name: 'taker', type: 'address' },
      { name: 'takeAsset', type: 'Asset' },
      { name: 'salt', type: 'uint256' },
      { name: 'start', type: 'uint256' },
      { name: 'end', type: 'uint256' },
      { name: 'dataType', type: 'bytes4' },
      { name: 'data', type: 'bytes' },
    ],
  };

  public static async sign(order, walletAddress, verifyingContract, web3) {
    const chainId = Number(await web3.eth.getChainId());
    const data = EIP712.createTypeData(
      {
        name: 'Exchange',
        version: '2',
        chainId,
        verifyingContract,
      },
      'Order',
      order,
      this.types,
    );
    return (await EIP712.signTypedData(web3, walletAddress, data)).sig;
  }

  /**
   * Returns current UTC timestamp in seconds.
   */
  public static getUtcTimestamp() {
    return Math.floor(new Date().getTime() / 1000);
  }
}
