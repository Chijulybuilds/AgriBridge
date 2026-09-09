// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityToken} from "src/CommodityToken.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ICommodityPriceOracle} from "src/interfaces/ICommodityPriceOracle.sol";

contract FuzzMockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title LendingPoolFuzzTest
 * @notice Property tests over the real contract set, covering deposit/withdraw round trips,
 *         collateral valuation scaling, and the loan-to-value ceiling.
 * @dev This file previously existed but was empty, so the directory structure implied fuzz
 *      coverage that did not exist.
 */
contract LendingPoolFuzzTest is Test {
    CommodityRegistry internal registry;
    CommodityToken internal commodityToken;
    CommodityPriceOracle internal oracle;
    AgriShareToken internal shareToken;
    LendingPool internal pool;
    FuzzMockUSDC internal usdc;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal farmer = makeAddr("farmer");
    address internal investor = makeAddr("investor");

    uint256 internal constant HEARTBEAT = 1 days;
    uint128 internal constant COCOA_PRICE = 650 * 10 ** 6; // $6.50/kg, 8 decimals
    uint256 internal constant MAX_LTV_BPS = 7000; // 70%

    function setUp() public {
        vm.warp(100 weeks);

        usdc = new FuzzMockUSDC();
        registry = new CommodityRegistry(admin);
        commodityToken = new CommodityToken(admin, address(registry), "ipfs://base/");
        oracle = new CommodityPriceOracle(admin, HEARTBEAT);
        shareToken = new AgriShareToken(address(usdc), "agUSDC", "aU");
        pool = new LendingPool(
            admin, address(usdc), address(registry), address(commodityToken), address(shareToken), address(oracle)
        );

        shareToken.setLendingPool(address(pool));

        vm.startPrank(admin);
        registry.setCommodityTokenAddress(address(commodityToken));
        registry.setLendingPoolAddress(address(pool));
        registry.grantRole(registry.VERIFIER_ROLE(), verifier);
        registry.grantRole(registry.POOL_ROLE(), address(pool));
        oracle.setCommodityRegistry(address(registry));
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cocoa, COCOA_PRICE);
        vm.stopPrank();
    }

    /**
     * @notice A lone depositor who immediately withdraws every share must get their USDC back.
     * @dev With no borrowing there is no interest and no reserve accrual, so the round trip is
     *      exact. Catches share-conversion rounding that would quietly skim depositors.
     */
    function testFuzz_DepositWithdrawRoundTripIsLossless(uint256 amount) public {
        amount = bound(amount, 1e6, 10_000_000e6);

        usdc.mint(investor, amount);

        vm.startPrank(investor);
        usdc.approve(address(pool), amount);
        pool.deposit(amount);

        uint256 shares = shareToken.balanceOf(investor);
        assertGt(shares, 0, "deposit must mint shares");

        pool.withdraw(shares);
        vm.stopPrank();

        assertEq(usdc.balanceOf(investor), amount, "round trip must return the full deposit");
        assertEq(shareToken.balanceOf(investor), 0, "all shares must be burned");
    }

    /**
     * @notice Collateral valuation is linear in quantity and always in 6-decimal USD.
     */
    function testFuzz_CollateralValueScalesWithQuantity(uint96 quantityKg) public {
        uint256 kg = bound(uint256(quantityKg), 1, 1_000_000);
        uint96 quantity = uint96(kg * 1e18);

        uint256 commodityId = _registerAndApprove(quantity);

        uint256 value = oracle.getCollateralValue(commodityId, quantity);

        // price(8dp) * quantity(18dp) / 1e20 == kg * $6.50 expressed in 6 decimals
        assertEq(value, kg * 6_500_000, "valuation must stay linear and 6-decimal");
    }

    /**
     * @notice Any borrow the pool accepts must sit at or below the 70% loan-to-value ceiling.
     * @dev The inverse of the unit test's single-point check: no accepted borrow may exceed the
     *      ceiling, and no borrow below it may be rejected for LTV reasons.
     */
    function testFuzz_BorrowRespectsMaxLtv(uint256 quantityKg, uint256 borrowAmount) public {
        uint256 kg = bound(quantityKg, 100, 100_000);
        uint96 quantity = uint96(kg * 1e18);

        uint256 collateralValue = kg * 6_500_000; // 6-decimal USD
        uint256 maxBorrow = (collateralValue * MAX_LTV_BPS) / 10_000;

        // Stay inside the pool's own borrow bounds so we test the LTV rule, not the bounds check.
        vm.assume(maxBorrow > 100e6);
        borrowAmount = bound(borrowAmount, 100e6, maxBorrow);

        uint256 commodityId = _registerAndApprove(quantity);
        _seedPool(borrowAmount * 2 + 1_000e6);

        vm.startPrank(farmer);
        commodityToken.setApprovalForAll(address(pool), true);
        uint256 loanId = pool.borrow(commodityId, quantity, borrowAmount);
        vm.stopPrank();

        assertEq(usdc.balanceOf(farmer), borrowAmount);

        // Every accepted loan must open healthy.
        assertGe(pool.getHealthFactor(loanId), 1e18, "accepted loan must open at health factor >= 1");
    }

    /**
     * @notice Borrowing above the ceiling must always be rejected.
     */
    function testFuzz_BorrowAboveMaxLtvAlwaysReverts(uint256 quantityKg, uint256 excess) public {
        uint256 kg = bound(quantityKg, 100, 100_000);
        uint96 quantity = uint96(kg * 1e18);

        uint256 collateralValue = kg * 6_500_000;
        uint256 maxBorrow = (collateralValue * MAX_LTV_BPS) / 10_000;

        vm.assume(maxBorrow > 100e6);
        // Ask for more than the ceiling, while staying under the protocol's max borrow bound.
        excess = bound(excess, 1e6, 1_000_000e6);
        uint256 borrowAmount = maxBorrow + excess;
        vm.assume(borrowAmount <= 10_000_000e6);

        uint256 commodityId = _registerAndApprove(quantity);
        _seedPool(borrowAmount + 1_000_000e6);

        vm.startPrank(farmer);
        commodityToken.setApprovalForAll(address(pool), true);
        vm.expectRevert(LendingPool.LendingPool__ExceedsMaxLTV.selector);
        pool.borrow(commodityId, quantity, borrowAmount);
        vm.stopPrank();
    }

    /**
     * @notice Debt never decreases as time passes on an untouched loan.
     */
    function testFuzz_DebtIsMonotonicOverTime(uint256 elapsed) public {
        elapsed = bound(elapsed, 1, 365 days);

        uint256 kg = 1_000;
        uint96 quantity = uint96(kg * 1e18);
        uint256 commodityId = _registerAndApprove(quantity);
        _seedPool(100_000e6);

        vm.startPrank(farmer);
        commodityToken.setApprovalForAll(address(pool), true);
        uint256 loanId = pool.borrow(commodityId, quantity, 4_000e6);
        vm.stopPrank();

        (,,,, uint256 debtBefore) = pool.getLoanDetails(loanId);

        vm.warp(block.timestamp + elapsed);

        (,,,, uint256 debtAfter) = pool.getLoanDetails(loanId);

        assertGe(debtAfter, debtBefore, "debt must never shrink while a loan sits untouched");
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _registerAndApprove(uint96 quantity) internal returns (uint256 commodityId) {
        vm.prank(farmer);
        commodityId = registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa,
            quantity,
            CommodityRegistry.Grade.A,
            uint64(block.timestamp - 1 days),
            180
        );

        vm.prank(verifier);
        registry.approveCommodity(commodityId);
    }

    function _seedPool(uint256 liquidity) internal {
        usdc.mint(investor, liquidity);

        vm.startPrank(investor);
        usdc.approve(address(pool), liquidity);
        pool.deposit(liquidity);
        vm.stopPrank();
    }
}
