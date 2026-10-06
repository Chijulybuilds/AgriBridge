// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {CommodityConfig} from "src/CommodityConfig.sol";
import {CommodityDefaults} from "script/CommodityDefaults.sol";

contract CommodityConfigTest is Test {
    CommodityConfig public config;

    address public admin = makeAddr("admin");
    address public stranger = makeAddr("stranger");

    event CommodityAdded(uint256 indexed commodityId, string name);
    event CommodityUpdated(uint256 indexed commodityId);
    event CommodityActiveSet(uint256 indexed commodityId, bool active);

    function setUp() public {
        config = new CommodityConfig(admin);
    }

    /// @dev A valid row to mutate in the validation tests.
    function _cocoa() internal pure returns (CommodityConfig.Commodity memory) {
        return CommodityDefaults.all()[0];
    }

    function _add(CommodityConfig.Commodity memory _row) internal returns (uint256) {
        vm.prank(admin);
        return config.addCommodity(_row);
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_GrantsAdmin() public view {
        assertTrue(config.hasRole(config.DEFAULT_ADMIN_ROLE(), admin));
        assertEq(config.commodityCount(), 0);
    }

    /*//////////////////////////////////////////////////////////////
                             ADD COMMODITY
    //////////////////////////////////////////////////////////////*/

    function test_AddCommodity_StoresRowAndEmits() public {
        vm.expectEmit(true, false, false, true, address(config));
        emit CommodityAdded(1, "Cocoa");

        uint256 id = _add(_cocoa());

        assertEq(id, 1);
        assertEq(config.commodityCount(), 1);

        CommodityConfig.Commodity memory stored = config.getCommodity(id);
        assertEq(stored.name, "Cocoa");
        assertTrue(stored.active);
        assertEq(uint8(stored.priceSource), uint8(CommodityConfig.PriceSource.Global));
        assertEq(stored.gradeBFactorBps, 7_500);
        assertEq(stored.gradeCFactorBps, 4_000);
        assertEq(stored.daysToGradeB, 180);
        assertEq(stored.daysToGradeC, 360);
        assertEq(stored.daysToExpiry, 540);
        assertEq(stored.maxLtvBps, 5_000);
        assertEq(stored.liquidationLtvBps, 8_000);
        assertEq(stored.basisBps, 1_500);
        assertEq(stored.storageFeePerTonMonth, 5e6);
    }

    function test_AddCommodity_IdsIncrease() public {
        assertEq(_add(_cocoa()), 1);
        assertEq(_add(_cocoa()), 2);
        assertEq(config.commodityCount(), 2);
    }

    function test_AddCommodity_Revert_NotAdmin() public {
        CommodityConfig.Commodity memory row = _cocoa();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, config.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        config.addCommodity(row);
    }

    /*//////////////////////////////////////////////////////////////
                            UPDATE COMMODITY
    //////////////////////////////////////////////////////////////*/

    function test_UpdateCommodity_ReplacesRow() public {
        uint256 id = _add(_cocoa());

        CommodityConfig.Commodity memory row = _cocoa();
        row.maxLtvBps = 4_500;
        row.storageFeePerTonMonth = 7e6;

        vm.expectEmit(true, false, false, false, address(config));
        emit CommodityUpdated(id);
        vm.prank(admin);
        config.updateCommodity(id, row);

        assertEq(config.getCommodity(id).maxLtvBps, 4_500);
        assertEq(config.getCommodity(id).storageFeePerTonMonth, 7e6);
    }

    function test_UpdateCommodity_Revert_Unknown() public {
        CommodityConfig.Commodity memory row = _cocoa();
        vm.expectRevert(abi.encodeWithSelector(CommodityConfig.CommodityConfig__UnknownCommodity.selector, 1));
        vm.prank(admin);
        config.updateCommodity(1, row);
    }

    function test_UpdateCommodity_Revert_NotAdmin() public {
        uint256 id = _add(_cocoa());
        CommodityConfig.Commodity memory row = _cocoa();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, config.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        config.updateCommodity(id, row);
    }

    /*//////////////////////////////////////////////////////////////
                               ACTIVATION
    //////////////////////////////////////////////////////////////*/

    function test_SetCommodityActive_TogglesIsActive() public {
        uint256 id = _add(_cocoa());
        assertTrue(config.isActive(id));

        vm.expectEmit(true, false, false, true, address(config));
        emit CommodityActiveSet(id, false);
        vm.prank(admin);
        config.setCommodityActive(id, false);
        assertFalse(config.isActive(id));

        vm.prank(admin);
        config.setCommodityActive(id, true);
        assertTrue(config.isActive(id));
    }

    function test_SetCommodityActive_Revert_Unknown() public {
        vm.expectRevert(abi.encodeWithSelector(CommodityConfig.CommodityConfig__UnknownCommodity.selector, 7));
        vm.prank(admin);
        config.setCommodityActive(7, true);
    }

    function test_IsActive_FalseForUnknownIds() public {
        _add(_cocoa());
        assertFalse(config.isActive(0));
        assertFalse(config.isActive(2));
    }

    function test_GetCommodity_Revert_Unknown() public {
        vm.expectRevert(abi.encodeWithSelector(CommodityConfig.CommodityConfig__UnknownCommodity.selector, 0));
        config.getCommodity(0);
    }

    /*//////////////////////////////////////////////////////////////
                               VALIDATION
    //////////////////////////////////////////////////////////////*/

    function _expectAddReverts(CommodityConfig.Commodity memory _row, bytes4 _error) internal {
        vm.expectRevert(_error);
        vm.prank(admin);
        config.addCommodity(_row);
    }

    function test_Validate_Revert_EmptyName() public {
        CommodityConfig.Commodity memory row = _cocoa();
        row.name = "";
        _expectAddReverts(row, CommodityConfig.CommodityConfig__EmptyName.selector);
    }

    function test_Validate_Revert_GradeFactors() public {
        bytes4 err = CommodityConfig.CommodityConfig__InvalidGradeFactors.selector;

        CommodityConfig.Commodity memory row = _cocoa();
        row.gradeCFactorBps = 0; // Grade C would be worthless
        _expectAddReverts(row, err);

        row = _cocoa();
        row.gradeCFactorBps = row.gradeBFactorBps + 1; // C worth more than B
        _expectAddReverts(row, err);

        row = _cocoa();
        row.gradeBFactorBps = 10_001; // B worth more than A
        _expectAddReverts(row, err);
    }

    function test_Validate_Revert_DecaySchedule() public {
        bytes4 err = CommodityConfig.CommodityConfig__InvalidDecaySchedule.selector;

        CommodityConfig.Commodity memory row = _cocoa();
        row.daysToGradeB = 0;
        _expectAddReverts(row, err);

        row = _cocoa();
        row.daysToGradeC = row.daysToGradeB; // B and C on the same day
        _expectAddReverts(row, err);

        row = _cocoa();
        row.daysToExpiry = row.daysToGradeC; // expires the day it becomes C
        _expectAddReverts(row, err);
    }

    function test_Validate_Revert_Ltv() public {
        bytes4 err = CommodityConfig.CommodityConfig__InvalidLtv.selector;

        CommodityConfig.Commodity memory row = _cocoa();
        row.maxLtvBps = 0;
        _expectAddReverts(row, err);

        row = _cocoa();
        row.maxLtvBps = row.liquidationLtvBps; // a new loan would be liquidatable at once
        _expectAddReverts(row, err);

        row = _cocoa();
        row.liquidationLtvBps = 10_000; // liquidates only once the loan is underwater
        _expectAddReverts(row, err);
    }

    function test_Validate_Revert_Basis() public {
        CommodityConfig.Commodity memory row = _cocoa();
        row.basisBps = 10_000;
        _expectAddReverts(row, CommodityConfig.CommodityConfig__InvalidBasis.selector);
    }

    function testFuzz_Validate_LtvMustLeaveABuffer(uint16 _maxLtv, uint16 _liquidationLtv) public {
        CommodityConfig.Commodity memory row = _cocoa();
        row.maxLtvBps = _maxLtv;
        row.liquidationLtvBps = _liquidationLtv;

        bool valid = _maxLtv > 0 && _maxLtv < _liquidationLtv && _liquidationLtv < 10_000;
        if (!valid) vm.expectRevert(CommodityConfig.CommodityConfig__InvalidLtv.selector);

        vm.prank(admin);
        config.addCommodity(row);
    }

    /*//////////////////////////////////////////////////////////////
                                DEFAULTS
    //////////////////////////////////////////////////////////////*/

    function test_Defaults_SeedSixValidCommodities() public {
        CommodityConfig.Commodity[] memory rows = CommodityDefaults.all();
        for (uint256 i = 0; i < rows.length; i++) {
            _add(rows[i]);
        }

        assertEq(config.commodityCount(), CommodityDefaults.COUNT);
        assertEq(config.getCommodity(CommodityDefaults.COCOA).name, "Cocoa");
        assertEq(config.getCommodity(CommodityDefaults.RICE).name, "Rice");
        assertEq(config.getCommodity(CommodityDefaults.MAIZE).name, "Maize");
        assertEq(config.getCommodity(CommodityDefaults.CASHEW).name, "Cashew");
        assertEq(config.getCommodity(CommodityDefaults.YAM).name, "Yam");
        assertEq(config.getCommodity(CommodityDefaults.SOYBEANS).name, "Soybeans");

        // Local-price crops: no basis cut. Yam: the fastest decay and a lower loan limit.
        assertEq(
            uint8(config.getCommodity(CommodityDefaults.CASHEW).priceSource), uint8(CommodityConfig.PriceSource.Local)
        );
        assertEq(config.getCommodity(CommodityDefaults.YAM).maxLtvBps, 4_000);
        assertEq(config.getCommodity(CommodityDefaults.YAM).daysToExpiry, 180);
    }
}
