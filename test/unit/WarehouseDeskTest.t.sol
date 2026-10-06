// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {WarehouseDesk} from "src/WarehouseDesk.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title WarehouseDeskTest
 * @notice Withdrawing produce: storage fees, pickup and delivery, release by the Safe (which burns the
 *         tokens and lowers the warehouse's stock), and refunds on cancel or reject.
 * @dev Cocoa storage is a placeholder $5 per metric ton per 30 days.
 */
contract WarehouseDeskTest is ProtocolFixture {
    WarehouseDesk internal desk;

    address internal regulator = makeAddr("regulator");

    uint96 internal constant KG = 1_000e18;
    uint256 internal lotId;

    function setUp() public {
        _deployFixture();
        desk = d.desk;
        d.registry.grantRole(d.registry.REGULATOR_ROLE(), regulator);

        lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);
        usdc.mint(farmer, 1_000e6);
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(desk), true);
        usdc.approve(address(desk), type(uint256).max);
        vm.stopPrank();
    }

    function _request(uint256 _kg, uint256 _deliveryBudget) internal returns (uint256) {
        vm.prank(farmer);
        return desk.requestWithdrawal(lotId, _kg, _deliveryBudget);
    }

    /*//////////////////////////////////////////////////////////////
                              STORAGE FEES
    //////////////////////////////////////////////////////////////*/

    /// @notice 400 kg (0.4 t) stored for 60 days (2 months) at $5 per ton-month is $4.
    function test_StorageFee_IsProRataByTheDay() public {
        assertEq(desk.storageFeeOf(lotId, 400e18), 0, "nothing owed on the day of intake");

        vm.warp(block.timestamp + 60 days);
        assertEq(desk.storageFeeOf(lotId, 400e18), 4e6);
        assertEq(desk.storageFeeOf(lotId, KG), 10e6);
    }

    /*//////////////////////////////////////////////////////////////
                                REQUESTS
    //////////////////////////////////////////////////////////////*/

    function test_Request_HoldsTheTokensAndTheFee() public {
        vm.warp(block.timestamp + 60 days);
        uint256 requestId = _request(400e18, 0);

        WarehouseDesk.Request memory request = desk.getRequest(requestId);
        assertEq(request.holder, farmer);
        assertEq(request.kg, 400e18);
        assertEq(request.storageFee, 4e6);
        assertEq(uint8(request.status), uint8(WarehouseDesk.RequestStatus.Pending));
        assertEq(d.commodityToken.balanceOf(address(desk), lotId), 400e18);
        assertEq(usdc.balanceOf(farmer), 996e6);
    }

    function test_Request_Revert_FrozenOrUnverifiedLot() public {
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);
        vm.expectRevert(WarehouseDesk.WarehouseDesk__LotFrozen.selector);
        _request(100e18, 0);

        vm.prank(farmer);
        uint256 pending = d.registry.requestIntake(COCOA, KG, warehouseId, uint64(block.timestamp));
        vm.expectRevert(WarehouseDesk.WarehouseDesk__LotNotVerified.selector);
        vm.prank(farmer);
        desk.requestWithdrawal(pending, 1e18, 0);
    }

    /// @notice Expired stock still belongs to its holder, who can always take it out.
    function test_Request_ExpiredStockCanStillBeWithdrawn() public {
        vm.warp(d.registry.expiresAt(lotId) + 1 days);
        usdc.mint(farmer, 1_000e6);
        uint256 requestId = _request(KG, 0);
        assertEq(uint8(desk.getRequest(requestId).status), uint8(WarehouseDesk.RequestStatus.Pending));
    }

    /*//////////////////////////////////////////////////////////////
                                RELEASE
    //////////////////////////////////////////////////////////////*/

    /// @notice Pickup: the Safe confirms, the tokens are burned and the warehouse's stock goes down.
    function test_ConfirmRelease_BurnsAndLowersTheStock() public {
        vm.warp(block.timestamp + 60 days);
        uint256 requestId = _request(400e18, 0);
        uint256 treasuryBefore = usdc.balanceOf(address(this));

        vm.prank(SAFE);
        desk.confirmRelease(requestId, 0);

        assertEq(d.commodityToken.totalSupply(lotId), 600e18, "400 kg of tokens burned");
        assertEq(d.registry.getWarehouse(warehouseId).storedKg, 600e18, "400 kg left the warehouse");
        assertEq(usdc.balanceOf(address(this)) - treasuryBefore, 4e6, "storage fee to the treasury");
        assertEq(uint8(desk.getRequest(requestId).status), uint8(WarehouseDesk.RequestStatus.Released));
    }

    /// @notice Delivery: the farmer escrows $50, the warehouse charges $30, $20 comes back.
    function test_ConfirmRelease_DeliveryRefundsTheUnusedBudget() public {
        uint256 requestId = _request(400e18, 50e6);
        assertEq(usdc.balanceOf(farmer), 950e6);

        vm.prank(SAFE);
        desk.confirmRelease(requestId, 30e6);
        assertEq(usdc.balanceOf(farmer), 970e6);
    }

    function test_ConfirmRelease_Revert_OverBudgetOrNotCustodian() public {
        uint256 requestId = _request(400e18, 50e6);

        vm.expectRevert(WarehouseDesk.WarehouseDesk__DeliveryOverBudget.selector);
        vm.prank(SAFE);
        desk.confirmRelease(requestId, 51e6);

        // Only the Safe confirms that goods left a warehouse; not even the admin.
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), desk.CUSTODIAN_ROLE()
            )
        );
        desk.confirmRelease(requestId, 0);
    }

    function test_ConfirmRelease_Revert_TwiceOrFrozen() public {
        uint256 first = _request(100e18, 0);
        vm.prank(SAFE);
        desk.confirmRelease(first, 0);
        vm.expectRevert(WarehouseDesk.WarehouseDesk__NotPending.selector);
        vm.prank(SAFE);
        desk.confirmRelease(first, 0);

        uint256 second = _request(100e18, 0);
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);
        vm.expectRevert(WarehouseDesk.WarehouseDesk__LotFrozen.selector);
        vm.prank(SAFE);
        desk.confirmRelease(second, 0);
    }

    /*//////////////////////////////////////////////////////////////
                            CANCEL AND REJECT
    //////////////////////////////////////////////////////////////*/

    function test_Cancel_RefundsEverything() public {
        vm.warp(block.timestamp + 60 days);
        uint256 requestId = _request(400e18, 50e6);

        vm.prank(farmer);
        desk.cancelRequest(requestId);

        assertEq(d.commodityToken.balanceOf(farmer, lotId), KG);
        assertEq(usdc.balanceOf(farmer), 1_000e6);
        assertEq(uint8(desk.getRequest(requestId).status), uint8(WarehouseDesk.RequestStatus.Cancelled));
    }

    function test_Cancel_Revert_NotTheHolder() public {
        uint256 requestId = _request(400e18, 0);
        vm.expectRevert(WarehouseDesk.WarehouseDesk__NotHolder.selector);
        vm.prank(SAFE);
        desk.cancelRequest(requestId);
    }

    function test_Reject_RefundsEverything() public {
        uint256 requestId = _request(400e18, 50e6);
        vm.prank(SAFE);
        desk.rejectRequest(requestId, "warehouse under fumigation");

        assertEq(d.commodityToken.balanceOf(farmer, lotId), KG);
        assertEq(usdc.balanceOf(farmer), 1_000e6);
        assertEq(uint8(desk.getRequest(requestId).status), uint8(WarehouseDesk.RequestStatus.Rejected));
    }

    /*//////////////////////////////////////////////////////////////
                    TOKENS ALWAYS MATCH STORED STOCK
    //////////////////////////////////////////////////////////////*/

    /// @notice Across intake, trading and withdrawal, tokens in existence equal kilograms in the warehouse.
    function testFuzz_TokensMatchStoredStock(uint256 _sold, uint256 _withdrawn) public {
        uint256 second = _verifiedLot(farmer, RICE, KG, CommodityRegistry.Grade.B);
        _sold = bound(_sold, 1e18, KG);
        _withdrawn = bound(_withdrawn, 1e18, KG);

        // Part of the cocoa changes hands; part of the rice leaves the warehouse.
        address buyer = makeAddr("buyer");
        vm.prank(farmer);
        d.commodityToken.safeTransferFrom(farmer, buyer, lotId, _sold, "");

        vm.prank(farmer);
        uint256 requestId = desk.requestWithdrawal(second, _withdrawn, 0);
        vm.prank(SAFE);
        desk.confirmRelease(requestId, 0);

        uint256 supply = d.commodityToken.totalSupply(lotId) + d.commodityToken.totalSupply(second);
        assertEq(supply, d.registry.getWarehouse(warehouseId).storedKg);
    }
}
