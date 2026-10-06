// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CommodityConfig} from "src/CommodityConfig.sol";
import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

contract CommodityRegistryTest is ProtocolFixture {
    CommodityRegistry internal registry;

    address internal stranger = makeAddr("stranger");
    address internal regulator = makeAddr("regulator");
    address internal custody = makeAddr("custody");

    uint96 internal constant KG = 1_000e18;

    event IntakeRequested(
        uint256 indexed lotId,
        address indexed farmer,
        uint256 indexed commodityId,
        uint256 warehouseId,
        uint96 estimatedKg,
        uint64 harvestDate
    );
    event IntakeApproved(
        uint256 indexed lotId,
        address indexed verifier,
        uint96 measuredKg,
        CommodityRegistry.Grade grade,
        bytes32 evidenceHash
    );
    event IntakeRejected(uint256 indexed lotId, address indexed verifier, bytes32 reason);
    event LotFrozen(uint256 indexed lotId, bool frozen);

    function setUp() public {
        _deployFixture();
        registry = d.registry;
        registry.grantRole(registry.REGULATOR_ROLE(), regulator);
        registry.grantRole(registry.CUSTODY_ROLE(), custody);
    }

    function _request(uint256 _commodityId) internal returns (uint256 lotId) {
        vm.prank(farmer);
        lotId = registry.requestIntake(_commodityId, KG, warehouseId, uint64(block.timestamp - 1 days));
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_SetsAdminAndConfig() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), address(this)));
        assertEq(address(registry.i_config()), address(d.config));
        assertEq(registry.commodityToken(), address(d.commodityToken));
    }

    function test_Constructor_Revert_ZeroAddresses() public {
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidAddress.selector);
        new CommodityRegistry(address(0), d.config);

        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidAddress.selector);
        new CommodityRegistry(address(this), CommodityConfig(address(0)));
    }

    /*//////////////////////////////////////////////////////////////
                               WAREHOUSES
    //////////////////////////////////////////////////////////////*/

    function test_AddWarehouse_StoresIt() public {
        uint256 id = registry.addWarehouse("Kano Hub", "Kano, Nigeria", 500e18);

        CommodityRegistry.Warehouse memory warehouse = registry.getWarehouse(id);
        assertEq(id, 2);
        assertEq(warehouse.name, "Kano Hub");
        assertEq(warehouse.region, "Kano, Nigeria");
        assertEq(warehouse.capacityKg, 500e18);
        assertEq(warehouse.storedKg, 0);
        assertTrue(warehouse.active);
        assertFalse(warehouse.frozen);
    }

    function test_AddWarehouse_Revert_BadInput() public {
        vm.expectRevert(CommodityRegistry.CommodityRegistry__EmptyName.selector);
        registry.addWarehouse("", "Kano", 500e18);

        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidQuantity.selector);
        registry.addWarehouse("Kano Hub", "Kano", 0);
    }

    function test_AddWarehouse_Revert_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, registry.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        registry.addWarehouse("Kano Hub", "Kano", 500e18);
    }

    function test_UpdateWarehouse_DeactivatingStopsIntake() public {
        registry.updateWarehouse(warehouseId, "Renamed", "Oyo", WAREHOUSE_CAPACITY, false);
        assertEq(registry.getWarehouse(warehouseId).name, "Renamed");

        vm.expectRevert(
            abi.encodeWithSelector(CommodityRegistry.CommodityRegistry__WarehouseUnavailable.selector, warehouseId)
        );
        _request(COCOA);
    }

    function test_GetWarehouse_Revert_Unknown() public {
        vm.expectRevert(abi.encodeWithSelector(CommodityRegistry.CommodityRegistry__WarehouseNotFound.selector, 9));
        registry.getWarehouse(9);
    }

    /*//////////////////////////////////////////////////////////////
                             REQUEST INTAKE
    //////////////////////////////////////////////////////////////*/

    function test_RequestIntake_RecordsPendingLot() public {
        uint64 harvest = uint64(block.timestamp - 3 days);

        vm.expectEmit(true, true, true, true, address(registry));
        emit IntakeRequested(1, farmer, MAIZE, warehouseId, KG, harvest);

        vm.prank(farmer);
        uint256 lotId = registry.requestIntake(MAIZE, KG, warehouseId, harvest);

        CommodityRegistry.Lot memory lot = registry.getLot(lotId);
        assertEq(lotId, 1);
        assertEq(lot.farmer, farmer);
        assertEq(uint8(lot.status), uint8(CommodityRegistry.LotStatus.Pending));
        assertEq(lot.commodityId, MAIZE);
        assertEq(lot.warehouseId, warehouseId);
        assertEq(lot.estimatedKg, KG);
        assertEq(lot.measuredKg, 0);
        assertEq(lot.harvestDate, harvest);
        assertEq(registry.getFarmerLots(farmer).length, 1);
        assertEq(registry.lotFarmer(lotId), farmer);
        assertEq(registry.commodityOf(lotId), MAIZE);
    }

    function test_RequestIntake_WorksForEveryCommodity() public {
        for (uint256 id = COCOA; id <= SOYBEANS; id++) {
            assertEq(registry.commodityOf(_request(id)), id);
        }
    }

    function test_RequestIntake_Revert_InactiveOrUnknownCommodity() public {
        d.config.setCommodityActive(YAM, false);
        vm.expectRevert(abi.encodeWithSelector(CommodityRegistry.CommodityRegistry__CommodityNotActive.selector, YAM));
        _request(YAM);

        vm.expectRevert(abi.encodeWithSelector(CommodityRegistry.CommodityRegistry__CommodityNotActive.selector, 99));
        _request(99);
    }

    function test_RequestIntake_Revert_BadQuantityOrDate() public {
        vm.startPrank(farmer);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidQuantity.selector);
        registry.requestIntake(COCOA, 0.5e18, warehouseId, uint64(block.timestamp));

        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidHarvestDate.selector);
        registry.requestIntake(COCOA, KG, warehouseId, uint64(block.timestamp + 1));

        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidHarvestDate.selector);
        registry.requestIntake(COCOA, KG, warehouseId, 0);
        vm.stopPrank();
    }

    function test_RequestIntake_Revert_UnknownWarehouse() public {
        vm.expectRevert(abi.encodeWithSelector(CommodityRegistry.CommodityRegistry__WarehouseNotFound.selector, 7));
        vm.prank(farmer);
        registry.requestIntake(COCOA, KG, 7, uint64(block.timestamp));
    }

    function test_RequestIntake_Revert_WhenPaused() public {
        registry.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _request(COCOA);
    }

    function test_CancelIntake_ByFarmerOnly() public {
        uint256 lotId = _request(COCOA);

        vm.expectRevert(CommodityRegistry.CommodityRegistry__NotLotFarmer.selector);
        vm.prank(stranger);
        registry.cancelIntake(lotId);

        vm.prank(farmer);
        registry.cancelIntake(lotId);
        assertEq(uint8(registry.getLot(lotId).status), uint8(CommodityRegistry.LotStatus.Cancelled));

        // A cancelled lot can no longer be approved.
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidStatus.selector);
        vm.prank(SAFE);
        registry.approveIntake(lotId, KG, CommodityRegistry.Grade.A, EVIDENCE);
    }

    /*//////////////////////////////////////////////////////////////
                         APPROVAL (SAFE ONLY)
    //////////////////////////////////////////////////////////////*/

    function test_ApproveIntake_MintsMeasuredKgToFarmer() public {
        uint256 lotId = _request(CASHEW);
        uint96 measured = 980e18; // the scale disagrees with the farmer's estimate

        vm.expectEmit(true, true, false, true, address(registry));
        emit IntakeApproved(lotId, SAFE, measured, CommodityRegistry.Grade.B, EVIDENCE);
        vm.prank(SAFE);
        registry.approveIntake(lotId, measured, CommodityRegistry.Grade.B, EVIDENCE);

        CommodityRegistry.Lot memory lot = registry.getLot(lotId);
        assertEq(uint8(lot.status), uint8(CommodityRegistry.LotStatus.Verified));
        assertEq(uint8(lot.grade), uint8(CommodityRegistry.Grade.B));
        assertEq(lot.measuredKg, measured);
        assertEq(lot.verifier, SAFE);
        assertEq(lot.verifiedAt, block.timestamp);
        assertEq(lot.evidenceHash, EVIDENCE);

        assertEq(d.commodityToken.balanceOf(farmer, lotId), measured);
        assertEq(registry.getWarehouse(warehouseId).storedKg, measured);
        assertTrue(registry.isUsable(lotId));
    }

    function test_ApproveIntake_Revert_AnyoneButTheSafe() public {
        uint256 lotId = _request(COCOA);
        bytes32 role = registry.VERIFIER_ROLE();

        // Not even the admin can verify.
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), role)
        );
        registry.approveIntake(lotId, KG, CommodityRegistry.Grade.A, EVIDENCE);

        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, farmer, role));
        vm.prank(farmer);
        registry.approveIntake(lotId, KG, CommodityRegistry.Grade.A, EVIDENCE);
    }

    function test_ApproveIntake_Revert_BadInput() public {
        uint256 lotId = _request(COCOA);
        vm.startPrank(SAFE);

        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidQuantity.selector);
        registry.approveIntake(lotId, 0.1e18, CommodityRegistry.Grade.A, EVIDENCE);

        vm.expectRevert(CommodityRegistry.CommodityRegistry__MissingEvidence.selector);
        registry.approveIntake(lotId, KG, CommodityRegistry.Grade.A, bytes32(0));

        registry.approveIntake(lotId, KG, CommodityRegistry.Grade.A, EVIDENCE);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidStatus.selector);
        registry.approveIntake(lotId, KG, CommodityRegistry.Grade.A, EVIDENCE);
        vm.stopPrank();
    }

    function test_ApproveIntake_Revert_OverCapacity() public {
        uint256 smallId = registry.addWarehouse("Small", "Oyo", 1_500e18);

        vm.startPrank(farmer);
        uint256 first = registry.requestIntake(COCOA, KG, smallId, uint64(block.timestamp));
        uint256 second = registry.requestIntake(COCOA, KG, smallId, uint64(block.timestamp));
        vm.stopPrank();

        vm.startPrank(SAFE);
        registry.approveIntake(first, KG, CommodityRegistry.Grade.A, EVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(CommodityRegistry.CommodityRegistry__OverCapacity.selector, smallId));
        registry.approveIntake(second, KG, CommodityRegistry.Grade.A, EVIDENCE);
        vm.stopPrank();
    }

    function test_RejectIntake_RecordsReason() public {
        uint256 lotId = _request(RICE);
        bytes32 reason = "moisture above 14%";

        vm.expectEmit(true, true, false, true, address(registry));
        emit IntakeRejected(lotId, SAFE, reason);
        vm.prank(SAFE);
        registry.rejectIntake(lotId, reason);

        CommodityRegistry.Lot memory lot = registry.getLot(lotId);
        assertEq(uint8(lot.status), uint8(CommodityRegistry.LotStatus.Rejected));
        assertEq(lot.rejectionReason, reason);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), 0);
        assertFalse(registry.isUsable(lotId));
    }

    function test_RejectIntake_Revert_NotVerifier() public {
        uint256 lotId = _request(RICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, registry.VERIFIER_ROLE()
            )
        );
        vm.prank(stranger);
        registry.rejectIntake(lotId, "no");
    }

    /*//////////////////////////////////////////////////////////////
                          SINGLE-VERIFIER RULE
    //////////////////////////////////////////////////////////////*/

    function test_Verifier_IsTheSafe() public view {
        assertEq(registry.verifier(), SAFE);
        assertTrue(registry.hasRole(registry.VERIFIER_ROLE(), SAFE));
    }

    function test_Verifier_CannotAddASecond() public {
        bytes32 role = registry.VERIFIER_ROLE();
        vm.expectRevert(abi.encodeWithSelector(CommodityRegistry.CommodityRegistry__VerifierAlreadySet.selector, SAFE));
        registry.grantRole(role, stranger);
    }

    function test_Verifier_ReplacingMeansRevokingFirst() public {
        bytes32 role = registry.VERIFIER_ROLE();
        registry.revokeRole(role, SAFE);
        assertEq(registry.verifier(), address(0));

        registry.grantRole(role, stranger);
        assertEq(registry.verifier(), stranger);
        assertFalse(registry.hasRole(role, SAFE));
    }

    function test_Verifier_RenouncingClearsIt() public {
        bytes32 role = registry.VERIFIER_ROLE();
        vm.prank(SAFE);
        registry.renounceRole(role, SAFE);
        assertEq(registry.verifier(), address(0));
    }

    /*//////////////////////////////////////////////////////////////
                               REGULATOR
    //////////////////////////////////////////////////////////////*/

    function test_SetLotFrozen_BlocksUse() public {
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);

        vm.expectEmit(true, false, false, true, address(registry));
        emit LotFrozen(lotId, true);
        vm.prank(regulator);
        registry.setLotFrozen(lotId, true);

        assertTrue(registry.isFrozen(lotId));
        assertFalse(registry.isUsable(lotId));

        vm.prank(regulator);
        registry.setLotFrozen(lotId, false);
        assertTrue(registry.isUsable(lotId));
    }

    function test_SetWarehouseFrozen_FreezesItsLotsAndIntake() public {
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);

        vm.prank(regulator);
        registry.setWarehouseFrozen(warehouseId, true);

        assertTrue(registry.isFrozen(lotId));
        assertFalse(registry.isUsable(lotId));
        vm.expectRevert(
            abi.encodeWithSelector(CommodityRegistry.CommodityRegistry__WarehouseUnavailable.selector, warehouseId)
        );
        _request(COCOA);
    }

    function test_Freeze_Revert_NotRegulator() public {
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);
        bytes32 role = registry.REGULATOR_ROLE();

        // The Safe verifies but does not regulate.
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, SAFE, role));
        vm.prank(SAFE);
        registry.setLotFrozen(lotId, true);
    }

    /*//////////////////////////////////////////////////////////////
                           GRADE AND EXPIRY
    //////////////////////////////////////////////////////////////*/

    function test_CurrentGrade_AgesOnTheCommoditySchedule() public {
        // Cocoa: B after 180 days, C after 360, expires after 540.
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);
        uint256 start = block.timestamp;

        assertEq(uint8(registry.currentGrade(lotId)), uint8(CommodityRegistry.Grade.A));
        vm.warp(start + 180 days - 1);
        assertEq(uint8(registry.currentGrade(lotId)), uint8(CommodityRegistry.Grade.A));
        vm.warp(start + 180 days);
        assertEq(uint8(registry.currentGrade(lotId)), uint8(CommodityRegistry.Grade.B));
        vm.warp(start + 360 days);
        assertEq(uint8(registry.currentGrade(lotId)), uint8(CommodityRegistry.Grade.C));

        assertEq(registry.expiresAt(lotId), start + 540 days);
        assertFalse(registry.isExpired(lotId));
        vm.warp(start + 540 days);
        assertTrue(registry.isExpired(lotId));
        assertFalse(registry.isUsable(lotId));
    }

    function test_CurrentGrade_YamAgesFastest() public {
        // Yam: B after 60 days, expires after 180.
        uint256 lotId = _verifiedLot(farmer, YAM, KG, CommodityRegistry.Grade.A);
        vm.warp(block.timestamp + 60 days);
        assertEq(uint8(registry.currentGrade(lotId)), uint8(CommodityRegistry.Grade.B));
        assertEq(registry.expiresAt(lotId), registry.getLot(lotId).verifiedAt + 180 days);
    }

    function test_CurrentGrade_LotGradedBStartsPartWayDown() public {
        // A Grade B cocoa lot is already 180 days along the curve: C after 180 more, expiry after 360 more.
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.B);
        uint256 start = block.timestamp;

        assertEq(uint8(registry.currentGrade(lotId)), uint8(CommodityRegistry.Grade.B));
        assertEq(registry.expiresAt(lotId), start + 360 days);
        vm.warp(start + 180 days);
        assertEq(uint8(registry.currentGrade(lotId)), uint8(CommodityRegistry.Grade.C));
    }

    function test_ExpiresAt_ZeroUntilVerified() public {
        uint256 lotId = _request(COCOA);
        assertEq(registry.expiresAt(lotId), 0);
        assertFalse(registry.isExpired(lotId));
        assertFalse(registry.isUsable(lotId));
    }

    /*//////////////////////////////////////////////////////////////
                                CUSTODY
    //////////////////////////////////////////////////////////////*/

    function test_RecordRelease_LowersStoredStock() public {
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);

        vm.prank(custody);
        registry.recordRelease(lotId, 400e18);
        assertEq(registry.getWarehouse(warehouseId).storedKg, 600e18);
    }

    function test_RecordRelease_Revert_NotCustodyOrNotVerified() public {
        uint256 pending = _request(COCOA);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, registry.CUSTODY_ROLE()
            )
        );
        vm.prank(stranger);
        registry.recordRelease(pending, 1e18);

        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidStatus.selector);
        vm.prank(custody);
        registry.recordRelease(pending, 1e18);
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    function test_GetLot_Revert_Unknown() public {
        vm.expectRevert(abi.encodeWithSelector(CommodityRegistry.CommodityRegistry__LotNotFound.selector, 0));
        registry.getLot(0);

        vm.expectRevert(abi.encodeWithSelector(CommodityRegistry.CommodityRegistry__LotNotFound.selector, 1));
        registry.getLot(1);
    }

    function test_IsUsable_FalseForUnknownLot() public view {
        assertFalse(registry.isUsable(0));
        assertFalse(registry.isUsable(42));
    }
}
