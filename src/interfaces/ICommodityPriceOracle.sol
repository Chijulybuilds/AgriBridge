// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Price surface the lending pool reads.
interface ICommodityPriceOracle {
    /// @notice Decimals of every price (8).
    function decimals() external view returns (uint8);

    /// @notice USD price per kilogram for a commodity id. Reverts if the feed is inactive or stale.
    function getPriceFresh(uint256 commodityId) external view returns (uint256 answer);
}
