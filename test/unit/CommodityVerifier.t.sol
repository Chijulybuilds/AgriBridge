// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/CommodityRegistry.sol";
import "../../src/CommodityVerifier.sol";
import "../../src/CommodityToken.sol";

/**
 * @title CommodityVerifierTest
 * @author AgriDeFi Protocol Team
 * @notice Unit tests for CommodityVerifier contract
 */
contract CommodityVerifierTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE
    //////////////////////////////////////////////////////////////*/

    CommodityRegistry public registry;
    CommodityToken public token;
    CommodityVerifier public verifier;

    address public farmer = address(0x1111);
    address public verifierAddr = address(0x2222);
    address public owner;

    /*//////////////////////////////////////////////////////////////
                            SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        owner = address(this);
        registry = new CommodityRegistry();

        token = new CommodityToken(
            "ipfs://QmXxxx",
            address(0), // Temp
            address(0) // Temp
        );

        verifier = new CommodityVerifier(address(registry), address(token));

        // Wire permissions
        token.setVerifier(address(verifier));
        token.setLendingPool(address(this)); // For testing
        registry.addVerifier(address(verifier));
    }

    /*//////////////////////////////////////////////////////////////
                        VERIFICATION TESTS
    //////////////////////////////////////////////////////////////*/

    function testVerifyCommodity() public {
        // Register commodity
        vm.prank(farmer);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        // Verify commodity
        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        // Check commodity is verified
        CommodityRegistry.Commodity memory commodity = registry.getCommodity(commodityId);
        assertEq(commodity.status, CommodityRegistry.CommodityStatus.VERIFIED);

        // Check tokens minted
        assertEq(token.balanceOf(farmer, 1), 1000e18);
    }

    function testRejectCommodity() public {
        vm.prank(farmer);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(address(verifier));
        verifier.rejectCommodity(commodityId, "Poor quality");

        CommodityRegistry.Commodity memory commodity = registry.getCommodity(commodityId);
        assertEq(commodity.status, CommodityRegistry.CommodityStatus.REJECTED);
    }

    function testExpireCommodity() public {
        vm.prank(farmer);
        uint256 commodityId = registry.registerCommodity(
            "Cocoa",
            1000e18,
            "A",
            65000,
            block.timestamp - 10 days,
            1 // 1 day storage
        );

        vm.warp(block.timestamp + 2 days);

        vm.prank(address(verifier));
        verifier.expireCommodity(commodityId);

        CommodityRegistry.Commodity memory commodity = registry.getCommodity(commodityId);
        assertEq(commodity.status, CommodityRegistry.CommodityStatus.EXPIRED);
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTION TESTS
    //////////////////////////////////////////////////////////////*/

    function testGetTokenIdForCommodity() public {
        vm.prank(farmer);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        uint256 tokenId = verifier.getTokenIdForCommodity(commodityId);
        assertEq(tokenId, 1);
    }

    function testGetCommodityIdForToken() public {
        vm.prank(farmer);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        uint256 retrievedId = verifier.getCommodityIdForToken(1);
        assertEq(retrievedId, commodityId);
    }
}
