// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICommodityToken {
    function mintCommodity(address to, uint256 quantity, bytes calldata data) external returns (uint256 tokenId);
    function getCommodityId(uint256 tokenId) external view returns (uint256);
}
