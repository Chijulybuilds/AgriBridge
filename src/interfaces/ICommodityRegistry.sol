// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

library DataTypes {
    enum CommodityStatus {
        PENDING,
        VERIFIED,
        REJECTED,
        EXPIRED
    }
    enum CommodityType {
        COCOA, // Alignment index layout
        RICE,
        MAIZE,
        CASHEW,
        YAM
    }

    struct Commodity {
        address farmer;
        CommodityType commodityType;
        uint256 quantity; // Unit weight metric (e.g., in kg)
        uint256 storageEndDate;
        CommodityStatus status;
        uint256 tokenId;
    }
}

interface ICommodityRegistry {
    function getCommodity(uint256 commodityId) external view returns (DataTypes.Commodity memory);
    function updateCommodityStatus(uint256 commodityId, DataTypes.CommodityStatus status) external;
    function rejectCommodity(uint256 commodityId, string calldata reason) external;
    function expireCommodity(uint256 commodityId) external;
}
