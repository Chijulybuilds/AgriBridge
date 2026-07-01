// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DataTypes} from "./ICommodityRegistry.sol"; // Adjust path as necessary

interface ICommodityPriceOracle {
    enum CommodityType {
        Cocoa,
        Rice,
        Maize,
        Cashew,
        Yam
    }

    struct PriceData {
        uint256 answer;
        uint256 updatedAt;
        bool active;
    }

    function VERSION() external view returns (uint256);
    function decimals() external view returns (uint8);
    function getPrice(CommodityType _commodity) external view returns (uint256 answer, uint256 updatedAt);
    function getPriceFresh(CommodityType _commodity) external view returns (uint256 answer);
    function isFresh(CommodityType _commodity) external view returns (bool);
    function getPriceFreshData(DataTypes.CommodityType commodity) external view returns (uint256 answer);
}
