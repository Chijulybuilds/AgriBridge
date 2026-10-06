// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommodityConfig} from "src/CommodityConfig.sol";

/**
 * @title CommodityDefaults
 * @notice Starting settings for the six commodities AgriBridge launches with, shared by the deploy
 *         scripts and the tests so both seed the same rows.
 * @dev PLACEHOLDER NUMBERS. Shelf lives, grade values, basis cuts and storage fees must be confirmed
 *      with a warehouse partner before real use. Ids follow the order of `all()`: 1 Cocoa, 2 Rice,
 *      3 Maize, 4 Cashew, 5 Yam, 6 Soybeans.
 */
library CommodityDefaults {
    uint256 internal constant COCOA = 1;
    uint256 internal constant RICE = 2;
    uint256 internal constant MAIZE = 3;
    uint256 internal constant CASHEW = 4;
    uint256 internal constant YAM = 5;
    uint256 internal constant SOYBEANS = 6;

    uint256 internal constant COUNT = 6;

    function all() internal pure returns (CommodityConfig.Commodity[] memory rows) {
        rows = new CommodityConfig.Commodity[](COUNT);
        // World-priced export crops carry a basis cut for transport, export and storage.
        rows[0] = _row("Cocoa", CommodityConfig.PriceSource.Global, 180, 360, 540, 5_000, 1_500, 5e6);
        rows[1] = _row("Rice", CommodityConfig.PriceSource.Global, 180, 360, 540, 5_000, 1_000, 4e6);
        rows[2] = _row("Maize", CommodityConfig.PriceSource.Global, 180, 360, 540, 5_000, 1_000, 3e6);
        // No major futures market, so reporters post a local price and no basis cut applies.
        rows[3] = _row("Cashew", CommodityConfig.PriceSource.Local, 270, 450, 720, 5_000, 0, 5e6);
        // Yam spoils fastest and has only local prices, so it gets a lower loan limit.
        rows[4] = _row("Yam", CommodityConfig.PriceSource.Local, 60, 120, 180, 4_000, 0, 4e6);
        rows[5] = _row("Soybeans", CommodityConfig.PriceSource.Global, 180, 360, 540, 5_000, 1_000, 3e6);
    }

    /// @dev Grade B is worth 75% of Grade A and Grade C 40%; every commodity liquidates at 80% LTV.
    function _row(
        string memory _name,
        CommodityConfig.PriceSource _priceSource,
        uint16 _daysToGradeB,
        uint16 _daysToGradeC,
        uint16 _daysToExpiry,
        uint16 _maxLtvBps,
        uint16 _basisBps,
        uint64 _storageFeePerTonMonth
    ) private pure returns (CommodityConfig.Commodity memory) {
        return CommodityConfig.Commodity({
            name: _name,
            active: true,
            priceSource: _priceSource,
            gradeBFactorBps: 7_500,
            gradeCFactorBps: 4_000,
            daysToGradeB: _daysToGradeB,
            daysToGradeC: _daysToGradeC,
            daysToExpiry: _daysToExpiry,
            maxLtvBps: _maxLtvBps,
            liquidationLtvBps: 8_000,
            basisBps: _basisBps,
            storageFeePerTonMonth: _storageFeePerTonMonth
        });
    }
}
