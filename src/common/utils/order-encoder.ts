import { utils } from 'ethers';
import {
  AssetClass,
  // IAsset,
  Asset,
  IAssetType,
  // IBundleType,
  BundleType,
  IPart,
} from '../../modules/orders/order.types';

export const encodeAsset = (token?: string, tokenId?: number) => {
  if (tokenId) {
    return utils.defaultAbiCoder.encode(
      ['address', 'uint256'],
      [token, tokenId],
    );
  } else if (token) {
    return utils.defaultAbiCoder.encode(['address'], [token]);
  } else {
    return '0x';
  }
};

export const encodeBundle = (tokenAddresses: string[], tokenIds: any) => {
  const toEncode = tokenAddresses.map((token, index) => {
    return [token, tokenIds[index]];
  });
  return utils.defaultAbiCoder.encode(
    ['tuple(address,uint256[])[]'],
    [toEncode],
  );
};

export const encodeAssetData = (assetType: IAssetType | BundleType) => {
  if (assetType.assetClass === AssetClass.ERC721_BUNDLE) {
    const type = assetType as BundleType;
    return encodeBundle(type.contracts, type.tokenIds);
  }
  const type = assetType as IAssetType;
  return encodeAsset(type.contract, type.tokenId);
};

export const encodeAssetClass = (assetClass: string) => {
  if (!assetClass) {
    return '0xffffffff';
  }
  return utils.keccak256(utils.toUtf8Bytes(assetClass)).substring(0, 10);
};

export const encodeOrderData = (payments: IPart[]) => {
  if (!payments) {
    return '0x';
  }
  return utils.defaultAbiCoder.encode(
    ['tuple(tuple(address account,uint96 value)[] revenueSplits)'],
    [
      {
        revenueSplits: payments,
      },
    ],
  );
};

export const hashAssetType = (assetType: IAssetType) => {
  const assetTypeData = encodeAssetData(assetType);
  const encodedAssetType = utils.defaultAbiCoder.encode(
    ['bytes32', 'bytes4', 'bytes32'],
    [
      utils.keccak256(
        utils.toUtf8Bytes('AssetType(bytes4 assetClass,bytes data)'),
      ),
      encodeAssetClass(assetType.assetClass),
      utils.keccak256(assetTypeData),
    ],
  );
  return utils.keccak256(encodedAssetType);
};

export const hashAsset = (asset: Asset) => {
  const encodedAsset = utils.defaultAbiCoder.encode(
    ['bytes32', 'bytes32', 'uint256'],
    [
      utils.keccak256(
        utils.toUtf8Bytes(
          'Asset(AssetType assetType,uint256 value)AssetType(bytes4 assetClass,bytes data)',
        ),
      ),
      hashAssetType(asset.assetType),
      asset.value,
    ],
  );
  return utils.keccak256(encodedAsset);
};

export const hashOrderKey = (
  maker: string,
  makeAssetType: IAssetType | BundleType,
  takeAssetType: IAssetType | BundleType,
  salt: number,
) => {
  const encodedOrder = utils.defaultAbiCoder.encode(
    ['address', 'bytes32', 'bytes32', 'uint256'],
    [maker, hashAssetType(makeAssetType), hashAssetType(takeAssetType), salt],
  );
  return utils.keccak256(encodedOrder);
};
