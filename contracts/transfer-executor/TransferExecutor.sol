// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "../lib/LibAsset.sol";
import "../lib/LibTransfer.sol";
import "../interfaces/ITransferProxy.sol";
import "../interfaces/INftTransferProxy.sol";
import "../interfaces/IERC20TransferProxy.sol";
import "../interfaces/ITransferExecutor.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

abstract contract TransferExecutor is Initializable, OwnableUpgradeable, ITransferExecutor {
    using LibTransfer for address;

    mapping (bytes4 => address) proxies;

    uint256 public maxBundleSize;

    event ProxyChange(bytes4 indexed assetType, address proxy);

    function __TransferExecutor_init_unchained(INftTransferProxy transferProxy, IERC20TransferProxy erc20TransferProxy, uint256 _maxBundleSize) internal {
        proxies[LibAsset.ERC20_ASSET_CLASS] = address(erc20TransferProxy);
        proxies[LibAsset.ERC721_ASSET_CLASS] = address(transferProxy);
        proxies[LibAsset.ERC721_BUNDLE_ASSET_CLASS] = address(transferProxy);
        proxies[LibAsset.ERC1155_ASSET_CLASS] = address(transferProxy);
        maxBundleSize = _maxBundleSize;
    }

    function setTransferProxy(bytes4 assetType, address proxy) external onlyOwner {
        proxies[assetType] = proxy;
        emit ProxyChange(assetType, proxy);
    }

    function setMaxBundleSize(uint256 _maxBundleSize) external onlyOwner {
        require(_maxBundleSize > 0, "Bundle size should be > 0");
        maxBundleSize = _maxBundleSize;
    }

    function transfer(
        LibAsset.Asset memory asset,
        address from,
        address to,
        bytes4 transferDirection,
        bytes4 transferType
    ) internal override {
        if (asset.assetType.assetClass == LibAsset.ETH_ASSET_CLASS) {
            to.transferEth(asset.value);
        } else if (asset.assetType.assetClass == LibAsset.ERC20_ASSET_CLASS) {
            (address token) = abi.decode(asset.assetType.data, (address));
            IERC20TransferProxy(proxies[LibAsset.ERC20_ASSET_CLASS]).erc20safeTransferFrom(IERC20Upgradeable(token), from, to, asset.value);
        } else if (asset.assetType.assetClass == LibAsset.ERC721_ASSET_CLASS) {
            (address token, uint tokenId) = abi.decode(asset.assetType.data, (address, uint256));
            require(asset.value == 1, "erc721 value error");
            INftTransferProxy(proxies[LibAsset.ERC721_ASSET_CLASS]).erc721safeTransferFrom(IERC721Upgradeable(token), from, to, tokenId);
        } else if (asset.assetType.assetClass == LibAsset.ERC1155_ASSET_CLASS) {
            (address token, uint tokenId) = abi.decode(asset.assetType.data, (address, uint256));
            INftTransferProxy(proxies[LibAsset.ERC1155_ASSET_CLASS]).erc1155safeTransferFrom(IERC1155Upgradeable(token), from, to, tokenId, asset.value, "");
        } else if (asset.assetType.assetClass == LibAsset.ERC721_BUNDLE_ASSET_CLASS) {
            (INftTransferProxy.ERC721BundleItem[] memory erc721BundleItems) = abi.decode(asset.assetType.data, (INftTransferProxy.ERC721BundleItem[]));
            require(asset.value > 1 && asset.value <= maxBundleSize, "erc721 value error");
            INftTransferProxy(proxies[LibAsset.ERC721_BUNDLE_ASSET_CLASS]).erc721BundleSafeTransferFrom(erc721BundleItems, from, to);
        } else {
            ITransferProxy(proxies[asset.assetType.assetClass]).transfer(asset, from, to);
        }
        emit Transfer(asset, from, to, transferDirection, transferType);
    }

    uint256[49] private __gap;
}
