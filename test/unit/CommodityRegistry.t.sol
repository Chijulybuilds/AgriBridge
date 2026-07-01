// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/CommodityRegistry.sol";

/**
 * @title CommodityRegistryTest
 * @author AgriDeFi Protocol Team
 * @notice Unit tests for CommodityRegistry contract
 */
contract CommodityRegistryTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE
    //////////////////////////////////////////////////////////////*/

    CommodityRegistry public registry;
    address public farmer1 = address(0x1111);
    address public farmer2 = address(0x2222);
    address public verifier1 = address(0x3333);
    address public owner;

    /*//////////////////////////////////////////////////////////////
                            SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        owner = address(this);
        registry = new CommodityRegistry();
        registry.addVerifier(verifier1);
    }

    /*//////////////////////////////////////////////////////////////
                        REGISTRATION TESTS
    //////////////////////////////////////////////////////////////*/

    function testRegisterCommodity() public {
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity(
            "Cocoa",
            1000e18, // 1000 kg
            "A",
            65000, // $6500 in cents
            block.timestamp - 10 days, // 10 days ago
            180 // 180 days storage
        );

        assertEq(commodityId, 1);

        CommodityRegistry.Commodity memory commodity = registry.getCommodity(commodityId);

        assertEq(commodity.farmer, farmer1);
        assertEq(commodity.name, "Cocoa");
        assertEq(commodity.quantity, 1000e18);
        assertEq(commodity.grade, "A");
        assertEq(commodity.status, CommodityRegistry.CommodityStatus.PENDING);
    }

    function testRegisterMultipleCommodities() public {
        vm.startPrank(farmer1);

        uint256 id1 = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        uint256 id2 = registry.registerCommodity("Rice", 500e18, "Standard", 70000, block.timestamp - 5 days, 365);

        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(registry.getCommodityCount(), 2);

        uint256[] memory farmerCommodities = registry.getFarmerCommodities(farmer1);
        assertEq(farmerCommodities.length, 2);
    }

    function testRegisterCommodityInvalidQuantity() public {
        vm.prank(farmer1);
        vm.expectRevert(CommodityRegistry.InvalidQuantity.selector);
        registry.registerCommodity(
            "Cocoa",
            0, // Invalid: 0 quantity
            "A",
            65000,
            block.timestamp - 10 days,
            180
        );
    }

    function testRegisterCommodityInvalidPrice() public {
        vm.prank(farmer1);
        vm.expectRevert(CommodityRegistry.InvalidPrice.selector);
        registry.registerCommodity(
            "Cocoa",
            1000e18,
            "A",
            0, // Invalid: 0 price
            block.timestamp - 10 days,
            180
        );
    }

    function testRegisterCommodityFutureHarvestDate() public {
        vm.prank(farmer1);
        vm.expectRevert(CommodityRegistry.InvalidHarvestDate.selector);
        registry.registerCommodity(
            "Cocoa",
            1000e18,
            "A",
            65000,
            block.timestamp + 10 days, // Future date - invalid
            180
        );
    }

    function testRegisterCommodityInvalidStorageDuration() public {
        vm.prank(farmer1);
        vm.expectRevert(CommodityRegistry.InvalidStorageDuration.selector);
        registry.registerCommodity(
            "Cocoa",
            1000e18,
            "A",
            65000,
            block.timestamp - 10 days,
            0 // Invalid: 0 days
        );

        vm.prank(farmer1);
        vm.expectRevert(CommodityRegistry.InvalidStorageDuration.selector);
        registry.registerCommodity(
            "Cocoa",
            1000e18,
            "A",
            65000,
            block.timestamp - 10 days,
            731 // Invalid: > 730 days
        );
    }

    function testRegisterUnsupportedCommodity() public {
        vm.prank(farmer1);
        vm.expectRevert(CommodityRegistry.UnsupportedCommodity.selector);
        registry.registerCommodity(
            "Wheat", // Not supported
            1000e18,
            "A",
            50000,
            block.timestamp - 10 days,
            180
        );
    }

    /*//////////////////////////////////////////////////////////////
                        VERIFICATION TESTS
    //////////////////////////////////////////////////////////////*/

    function testVerifyCommodity() public {
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(verifier1);
        registry.verifyCommodity(commodityId, 1);

        CommodityRegistry.Commodity memory commodity = registry.getCommodity(commodityId);

        assertEq(commodity.status, CommodityRegistry.CommodityStatus.VERIFIED);
        assertEq(commodity.verifier, verifier1);
        assertEq(commodity.tokenId, 1);
    }

    function testVerifyNonPendingCommodity() public {
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(verifier1);
        registry.verifyCommodity(commodityId, 1);

        vm.prank(verifier1);
        vm.expectRevert(CommodityRegistry.InvalidCommodityStatus.selector);
        registry.verifyCommodity(commodityId, 2);
    }

    function testRejectCommodity() public {
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(verifier1);
        registry.rejectCommodity(commodityId, "Poor quality");

        CommodityRegistry.Commodity memory commodity = registry.getCommodity(commodityId);

        assertEq(commodity.status, CommodityRegistry.CommodityStatus.REJECTED);
    }

    function testExpireCommodity() public {
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity(
            "Cocoa",
            1000e18,
            "A",
            65000,
            block.timestamp - 10 days,
            1 // 1 day storage
        );

        // Fast forward past storage end date
        vm.warp(block.timestamp + 2 days);

        vm.prank(owner);
        registry.expireCommodity(commodityId);

        CommodityRegistry.Commodity memory commodity = registry.getCommodity(commodityId);

        assertEq(commodity.status, CommodityRegistry.CommodityStatus.EXPIRED);
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTION TESTS
    //////////////////////////////////////////////////////////////*/

    function testIsCommodityValid() public {
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        // Before verification
        assertEq(registry.isCommodityValid(commodityId), false);

        // After verification
        vm.prank(verifier1);
        registry.verifyCommodity(commodityId, 1);

        assertEq(registry.isCommodityValid(commodityId), true);
    }

    function testIsCommodityExpired() public {
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity(
            "Cocoa",
            1000e18,
            "A",
            65000,
            block.timestamp - 10 days,
            1 // 1 day storage
        );

        // Before expiry
        assertEq(registry.isCommodityExpired(commodityId), false);

        // After expiry
        vm.warp(block.timestamp + 2 days);
        assertEq(registry.isCommodityExpired(commodityId), true);
    }

    /*//////////////////////////////////////////////////////////////
                        ACCESS CONTROL TESTS
    //////////////////////////////////////////////////////////////*/

    function testOnlyVerifierCanVerify() public {
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(farmer2); // Not a verifier
        vm.expectRevert(CommodityRegistry.Unauthorized.selector);
        registry.verifyCommodity(commodityId, 1);
    }

    function testAddRemoveVerifier() public {
        address newVerifier = address(0x4444);

        vm.prank(owner);
        registry.addVerifier(newVerifier);

        assertEq(registry.isVerifier(newVerifier), true);

        vm.prank(owner);
        registry.removeVerifier(newVerifier);

        assertEq(registry.isVerifier(newVerifier), false);
    }
}
