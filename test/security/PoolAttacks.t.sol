// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityToken} from "src/CommodityToken.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/// @notice A borrower contract that tries to re-enter the pool when its collateral comes back.
contract ReentrantBorrower is ERC1155Holder {
    LendingPool internal immutable i_pool;
    IERC20 internal immutable i_usdc;
    bool public attack;

    constructor(LendingPool _pool, IERC20 _usdc, CommodityToken _token) {
        i_pool = _pool;
        i_usdc = _usdc;
        _token.setApprovalForAll(address(_pool), true);
        _usdc.approve(address(_pool), type(uint256).max);
    }

    function borrow(uint256 _lotId, uint256 _kg, uint256 _amount) external returns (uint256) {
        return i_pool.borrow(_lotId, _kg, _amount, uint64(block.timestamp + 30 days));
    }

    function repayAndAttack(uint256 _loanId) external {
        attack = true;
        i_pool.repay(_loanId, type(uint256).max);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes memory) public override returns (bytes4) {
        if (attack) i_pool.withdraw(1); // re-entry while the pool is mid-repayment
        return this.onERC1155Received.selector;
    }
}

/**
 * @title PoolAttacksTest
 * @notice One test per threat the STEM Festival brief names (reentrancy, flash-loan style exploits,
 *         oracle manipulation), plus the share-price attacks they enable. SECURITY.md maps each
 *         threat to the code that stops it and to the test here that proves it.
 */
contract PoolAttacksTest is ProtocolFixture {
    LendingPool internal pool;
    address internal attacker = makeAddr("attacker");
    address internal victim = makeAddr("victim");

    uint96 internal constant KG = 1_000e18;

    function setUp() public {
        _deployFixture();
        pool = d.pool;
    }

    function _depositAs(address _who, uint256 _amount) internal {
        usdc.mint(_who, _amount);
        vm.startPrank(_who);
        usdc.approve(address(pool), _amount);
        pool.deposit(_amount);
        vm.stopPrank();
    }

    function _withdrawAllAs(address _who) internal returns (uint256 received) {
        uint256 before = usdc.balanceOf(_who);
        uint256 shares = d.shareToken.balanceOf(_who);
        vm.prank(_who);
        pool.withdraw(shares);
        received = usdc.balanceOf(_who) - before;
    }

    /*//////////////////////////////////////////////////////////////
                    FLASH-LOAN STYLE: SHARE PRICE ATTACKS
    //////////////////////////////////////////////////////////////*/

    /// @notice USDC sent straight to the pool is ignored: it cannot move the share price.
    function test_Donation_DoesNotMoveTheSharePrice() public {
        _depositAs(investor, 10_000e6);
        uint256 assetsBefore = pool.totalAssets();
        uint256 sharesFor1k = pool.convertToShares(1_000e6);

        usdc.mint(attacker, 1_000_000e6);
        vm.prank(attacker);
        usdc.transfer(address(pool), 1_000_000e6);

        assertEq(pool.totalAssets(), assetsBefore);
        assertEq(pool.convertToShares(1_000e6), sharesFor1k);
    }

    /// @notice The classic first-deposit inflation attack: a dust deposit plus a large donation used
    ///         to round the next depositor's shares down to almost nothing. Here it gains nothing.
    function test_FirstDepositInflation_Fails() public {
        _depositAs(attacker, 1); // one unit of USDC (0.000001)
        usdc.mint(attacker, 10_000e6);
        vm.prank(attacker);
        usdc.transfer(address(pool), 10_000e6);

        _depositAs(victim, 5_000e6);
        vm.roll(block.number + 1);

        assertEq(_withdrawAllAs(victim), 5_000e6, "the victim gets every cent back");
        assertLe(_withdrawAllAs(attacker), 1, "the attacker recovers only the dust");
    }

    /**
     * @notice The repayment sandwich: deposit just before a large repayment, withdraw right after,
     *         and take a share of months of interest. Interest now counts as it accrues, so the
     *         repayment does not move the share price and the sandwich earns nothing.
     */
    function test_RepaymentSandwich_EarnsNothing() public {
        _depositAs(investor, 100_000e6);
        uint256 lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        uint256 loanId = _borrow(farmer, lotId, KG, 1_300e6, 180);

        vm.warp(block.timestamp + 150 days);
        usdc.mint(farmer, 1_000e6);
        vm.prank(farmer);
        usdc.approve(address(pool), type(uint256).max);

        // Same block: the attacker deposits, then the farmer repays five months of interest.
        _depositAs(attacker, 100_000e6);
        uint256 sharePriceBefore = pool.convertToAssets(1e12);
        vm.prank(farmer);
        pool.repay(loanId, type(uint256).max);
        assertEq(pool.convertToAssets(1e12), sharePriceBefore, "repayment does not move the share price");

        // Next block: the attacker leaves.
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 12);
        uint256 received = _withdrawAllAs(attacker);
        assertLe(received, 100_000e6 + 1, "nothing but rounding");
    }

    /// @notice Depositing and withdrawing in the same block is refused, closing single-transaction
    ///         (flash-loan funded) round trips.
    function test_SameBlockDepositAndWithdraw_Reverts() public {
        _depositAs(attacker, 10_000e6);
        uint256 shares = d.shareToken.balanceOf(attacker);

        vm.expectRevert(LendingPool.LendingPool__SameBlockWithdrawal.selector);
        vm.prank(attacker);
        pool.withdraw(shares);
    }

    /// @notice Protocol reserves never back investor withdrawals.
    function test_InvestorsCannotWithdrawReserves() public {
        _depositAs(investor, 1_000e6);
        usdc.mint(address(this), 500e6);
        usdc.approve(address(pool), 500e6);
        pool.depositReserves(500e6);

        uint256 lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        _borrow(farmer, lotId, KG, 400e6, 30); // $600 of investor cash left, plus $500 of reserves

        vm.roll(block.number + 1);
        uint256 shares = d.shareToken.balanceOf(investor);
        vm.expectRevert(LendingPool.LendingPool__InsufficientPoolCash.selector);
        vm.prank(investor);
        pool.withdraw(shares);
    }

    /*//////////////////////////////////////////////////////////////
                              REENTRANCY
    //////////////////////////////////////////////////////////////*/

    /// @notice A borrower contract that re-enters the pool when its collateral comes back is stopped.
    function test_Reentrancy_OnCollateralReturnIsBlocked() public {
        _depositAs(investor, 10_000e6);
        ReentrantBorrower borrower = new ReentrantBorrower(pool, IERC20(address(usdc)), d.commodityToken);

        uint256 lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        vm.prank(farmer);
        d.commodityToken.safeTransferFrom(farmer, address(borrower), lotId, KG, "");

        uint256 loanId = borrower.borrow(lotId, KG, 1_000e6);
        usdc.mint(address(borrower), 100e6);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        borrower.repayAndAttack(loanId);
    }

    /*//////////////////////////////////////////////////////////////
                          ORACLE MANIPULATION
    //////////////////////////////////////////////////////////////*/

    /// @notice One manipulated price update cannot trigger liquidations: the move cap holds it until a
    ///         later, independent update agrees.
    function test_OracleJump_CannotLiquidateOnItsOwn() public {
        _depositAs(investor, 50_000e6);
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);
        uint256 loanId = _borrow(farmer, lotId, KG, 2_000e6, 30);

        d.oracle.setPrice(COCOA, 280e6); // -57%: held, not applied
        assertFalse(pool.isLiquidatable(loanId));

        vm.warp(block.timestamp + 10 minutes);
        d.oracle.setPrice(COCOA, 280e6); // a later update agrees: now it applies
        assertTrue(pool.isLiquidatable(loanId));
    }

    /// @notice Pausing the oracle stops every valuation, so nothing is liquidated on a suspect price.
    function test_OracleBreaker_StopsLiquidations() public {
        _depositAs(investor, 50_000e6);
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);
        uint256 loanId = _borrow(farmer, lotId, KG, 2_000e6, 30);
        d.oracle.forcePrice(COCOA, 300e6);
        d.oracle.pause();

        vm.expectRevert();
        pool.isLiquidatable(loanId);
    }
}
