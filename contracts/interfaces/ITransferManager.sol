// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "../lib/LibAsset.sol";
import "../lib/LibFill.sol";
import "../transfer-executor/TransferExecutor.sol";

abstract contract ITransferManager is ITransferExecutor {
    bytes4 constant TO_MAKER = bytes4(keccak256("TO_MAKER"));
    bytes4 constant TO_TAKER = bytes4(keccak256("TO_TAKER"));
    bytes4 constant PROTOCOL = bytes4(keccak256("PROTOCOL"));
    bytes4 constant ROYALTY = bytes4(keccak256("ROYALTY"));
    bytes4 constant ORIGIN = bytes4(keccak256("ORIGIN"));
    bytes4 constant PAYOUT = bytes4(keccak256("PAYOUT"));
    bytes4 constant DAO = bytes4(keccak256("DAO"));
    bytes4 constant REVENUE_SPLIT = bytes4(keccak256("REVENUE_SPLIT"));

    function doTransfers(
        LibAsset.AssetType memory makeMatch,
        LibAsset.AssetType memory takeMatch,
        LibFill.FillResult memory fill,
        LibOrder.Order memory leftOrder,
        LibOrder.Order memory rightOrder
    ) internal virtual returns (uint totalMakeValue, uint totalTakeValue);
}
