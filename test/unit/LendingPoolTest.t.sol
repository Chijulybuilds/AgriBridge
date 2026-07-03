// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LendingPool} from "src/LendingPool.sol"; // Adjust import paths according to your structure
import {AgriShareToken} from "src/AgriShareToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// --- Concrete Mock Helper for ERC1155 Token ---
contract MockCommodityToken {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    function setBalance(address account, uint256 id, uint256 amount) external {
        balanceOf[account][id] = amount;
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata) external {
        require(balanceOf[from][id] >= value, "Insufficient balance");
        balanceOf[from][id] -= value;
        balanceOf[to][id] += value;
    }

    function burn(address from, uint256 id, uint256 amount) external {
        require(balanceOf[from][id] >= amount, "Insufficient balance");
        balanceOf[from][id] -= amount;
    }
}

// --- Concrete Mock Helper for Share Token ---
contract MockAgriShareToken is ERC20 {
    constructor() ERC20("Agri Share Token", "agUSDC") {}

    function mintShares(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burnShares(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

// -- Concrete Mock Helper for minting USDC Token ---
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        // Optional: Mint an initial supply to the deployer if needed
        // _mint(msg.sender, 1_000_000 * 10**6);
    }
}

/**
 * @title LendingPoolTest
 * @author Senior Smart Contract Engineer
 * @notice Exhaustive branch & function coverage test suite for LendingPool.sol
 */
contract LendingPoolTest is Test {
    LendingPool public pool;

    // Dependencies
    MockCommodityToken public commodityToken;
    MockAgriShareToken public shareToken;
    MockUSDC public usdc;

    // Mock Interface addresses
    address public registry = makeAddr("REGISTRY");
    address public priceOracle = makeAddr("PRICE_ORACLE");

    // Roles & Actors
    address public admin = makeAddr("ADMIN");
    address public farmer = makeAddr("FARMER");
    address public investor = makeAddr("INVESTOR");
    address public liquidator = makeAddr("LIQUIDATOR");

    // Copy errors exactly for assertion accuracy
    error LendingPool__UnauthorizedAccess();
    error LendingPool__ZeroAddress();
    error LendingPool__ZeroAmount();
    error LendingPool__InvalidLoanBounds();
    error LendingPool__InsufficientPoolCash();
    error LendingPool__CommodityNotApprovedForBorrowing();
    error LendingPool__Unauthorized();
    error LendingPool__InsufficientCollateralBalance();
    error LendingPool__ExceedsMaxLTV();
    error LendingPool__LoanNotActive();
    error LendingPool__RepaymentExceedsDebt();
    error LendingPool__PositionHealthy();
    error LendingPool__NativeTokenNotSupported();
    error LendingPool__InvalidCall();
    error LendingPool__InvalidReserveFactor();

    function setUp() public {
        usdc = new MockUSDC();
        commodityToken = new MockCommodityToken();
        shareToken = new MockAgriShareToken();

        // Deploy Core Pool under Admin identity
        vm.prank(admin);
        pool =
            new LendingPool(admin, address(usdc), registry, address(commodityToken), address(shareToken), priceOracle);

        // Standard labels for clean trace debugging
        vm.label(address(pool), "LendingPool");
        vm.label(address(usdc), "USDC");
        vm.label(address(commodityToken), "CommodityToken");
        vm.label(address(shareToken), "ShareToken");
    }

    // =========================================================================
    // CONSTRUCTOR TESTS
    // =========================================================================

    function test_Constructor_RevertOnZeroAddresses() public {
        vm.expectRevert(LendingPool__ZeroAddress.selector);
        new LendingPool(address(0), address(usdc), registry, address(commodityToken), address(shareToken), priceOracle);

        vm.expectRevert(LendingPool__ZeroAddress.selector);
        new LendingPool(admin, address(0), registry, address(commodityToken), address(shareToken), priceOracle);
    }

    // =========================================================================
    // MODIFIER & GUARD TESTS
    // =========================================================================

    function test_Modifier_CheckZeroAmount() public {
        vm.expectRevert(LendingPool__ZeroAmount.selector);
        pool.deposit(0);
    }

    function test_Modifier_OnlyAdmin() public {
        vm.startPrank(investor);
        vm.expectRevert(LendingPool__UnauthorizedAccess.selector);
        pool.pause();
        vm.stopPrank();
    }

    // =========================================================================
    // INVESTOR DEPOSIT & WITHDRAWAL PATHS
    // =========================================================================

    function test_DepositAndWithdraw_Success() public {
        deal(address(usdc), investor, 10_000e6);

        vm.startPrank(investor);
        usdc.approve(address(pool), 10_000e6);

        // Target deposit paths
        pool.deposit(10_000e6);
        assertEq(shareToken.balanceOf(investor), 10_000e6);

        // Target withdrawal paths
        pool.withdraw(5_000e6);
        assertEq(usdc.balanceOf(investor), 5_000e6);
        vm.stopPrank();
    }

    function test_Withdraw_Revert_InsufficientPoolCash() public {
        deal(address(usdc), address(pool), 0);
        vm.startPrank(investor);
        vm.expectRevert(LendingPool__InsufficientPoolCash.selector);
        pool.withdraw(1_000e6);
        vm.stopPrank();
    }

    // =========================================================================
    // BORROW LOGIC & PARAMETER BOUNDS
    // =========================================================================

    function test_Borrow_Revert_InvalidLoanBounds() public {
        vm.startPrank(farmer);
        // Below MIN_BORROW_AMOUNT ($100 / 100e6)
        vm.expectRevert(LendingPool__InvalidLoanBounds.selector);
        pool.borrow(1, 100e18, 50e6);

        // Above MAX_BORROW_AMOUNT ($10M / 10_000_000e6)
        vm.expectRevert(LendingPool__InvalidLoanBounds.selector);
        pool.borrow(1, 100e18, 11_000_000e6);
        vm.stopPrank();
    }

    function test_Borrow_Revert_InsufficientPoolCash() public {
        vm.startPrank(farmer);
        vm.expectRevert(LendingPool__InsufficientPoolCash.selector);
        pool.borrow(1, 100e18, 500e6);
        vm.stopPrank();
    }

    function test_Borrow_Revert_CommodityNotApproved() public {
        _fundPoolWithLiquidity(50_000e6);

        // Mock ICommodityRegistry.isApprovedForBorrowing -> false
        vm.mockCall(registry, abi.encodeWithSignature("isApprovedForBorrowing(uint256)"), abi.encode(false));

        vm.startPrank(farmer);
        vm.expectRevert(LendingPool__CommodityNotApprovedForBorrowing.selector);
        pool.borrow(1, 100e18, 1_000e6);
        vm.stopPrank();
    }

    function test_Borrow_Revert_UnauthorizedFarmer() public {
        _fundPoolWithLiquidity(50_000e6);
        _mockRegistryCommodityData(1, address(admin)); // Farmer is Admin, not caller

        vm.startPrank(farmer);
        vm.expectRevert(LendingPool__Unauthorized.selector);
        pool.borrow(1, 100e18, 1_000e6);
        vm.stopPrank();
    }

    function test_Borrow_Revert_InsufficientCollateralBalance() public {
        _fundPoolWithLiquidity(50_000e6);
        _mockRegistryCommodityData(1, farmer);
        commodityToken.setBalance(farmer, 1, 10e18); // set lower balance than locked collateral

        vm.startPrank(farmer);
        vm.expectRevert(LendingPool__InsufficientCollateralBalance.selector);
        pool.borrow(1, 20e18, 1_000e6);
        vm.stopPrank();
    }

    function test_Borrow_Revert_ExceedsMaxLTV() public {
        _fundPoolWithLiquidity(50_000e6);
        _mockRegistryCommodityData(1, farmer);
        commodityToken.setBalance(farmer, 1, 100e18);

        // Mocking collateral value to be worth $1,000. LTV max 70% ($700 max borrow)
        vm.mockCall(priceOracle, abi.encodeWithSignature("getCollateralValue(uint256,uint256)"), abi.encode(1_000e6));

        vm.startPrank(farmer);
        vm.expectRevert(LendingPool__ExceedsMaxLTV.selector);
        pool.borrow(1, 100e18, 800e6); // Attempting to borrow $800
        vm.stopPrank();
    }

    function test_Borrow_Success() public {
        _fundPoolWithLiquidity(50_000e6);
        _mockRegistryCommodityData(1, farmer);
        commodityToken.setBalance(farmer, 1, 100e18);
        vm.mockCall(priceOracle, abi.encodeWithSignature("getCollateralValue(uint256,uint256)"), abi.encode(10_000e6));

        vm.startPrank(farmer);
        uint256 loanId = pool.borrow(1, 100e18, 2_000e6);
        assertEq(loanId, 1);
        assertEq(usdc.balanceOf(farmer), 2_000e6);
        assertEq(commodityToken.balanceOf(address(pool), 1), 100e18);
        vm.stopPrank();
    }

    // =========================================================================
    // REPAYMENT & INTEREST ENGINE TESTS
    // =========================================================================

    function test_Repay_Revert_LoanNotActive() public {
        // Create an actual loan ID 1, but make it REPAID so it triggers the enum check
        // instead of panicking on a division-by-zero from uninitialized storage.
        uint256 loanId = _setupActiveLoan(2_000e6, 100e18);

        deal(address(usdc), farmer, 2_000e6);
        vm.startPrank(farmer);
        usdc.approve(address(pool), 2_000e6);
        pool.repay(loanId, 2_000e6); // Enters REPAID status

        // Now try to repay it again
        vm.expectRevert(LendingPool__LoanNotActive.selector);
        pool.repay(loanId, 100e6);
        vm.stopPrank();
    }

    function test_Repay_Revert_Overpayment() public {
        uint256 loanId = _setupActiveLoan(2_000e6, 100e18);

        deal(address(usdc), farmer, 5_000e6);
        vm.startPrank(farmer);
        usdc.approve(address(pool), 5_000e6);

        vm.expectRevert(LendingPool__RepaymentExceedsDebt.selector);
        pool.repay(loanId, 2_001e6);
        vm.stopPrank();
    }

    function test_Repay_Full_Success() public {
        uint256 loanId = _setupActiveLoan(2_000e6, 100e18);

        deal(address(usdc), farmer, 2_000e6);
        vm.startPrank(farmer);
        usdc.approve(address(pool), 2_000e6);

        pool.repay(loanId, 2_000e6);
        assertEq(commodityToken.balanceOf(farmer, 1), 100e18); // Collateral returned
        vm.stopPrank();
    }

    function test_Repay_Partial_Success() public {
        uint256 loanId = _setupActiveLoan(2_000e6, 100e18);

        deal(address(usdc), farmer, 1_000e6);
        vm.startPrank(farmer);
        usdc.approve(address(pool), 1_000e6);

        pool.repay(loanId, 1_000e6);

        // Read via the clean external view instead of directly reading unadjusted storage mappings
        (, uint256 principal,,,) = pool.getLoanDetails(loanId);
        assertEq(principal, 1_000e6);
        vm.stopPrank();
    }

    // =========================================================================
    // LIQUIDATION SYSTEM TESTS
    // =========================================================================

    function test_Liquidate_Revert_PositionHealthy() public {
        uint256 loanId = _setupActiveLoan(2_000e6, 100e18);

        vm.startPrank(admin);
        vm.expectRevert(LendingPool__PositionHealthy.selector);
        pool.liquidate(loanId);
        vm.stopPrank();
    }

    function test_Liquidate_Success() public {
        uint256 loanId = _setupActiveLoan(2_000e6, 100e18);

        // Crucial fix: Ensure the LendingPool actually owns the mock collateral in the mapping
        commodityToken.setBalance(address(pool), 1, 150e18);

        vm.mockCall(priceOracle, abi.encodeWithSignature("getCollateralValue(uint256,uint256)"), abi.encode(1_000e6));

        deal(address(usdc), admin, 2_000e6);
        vm.startPrank(admin);
        usdc.approve(address(pool), 2_000e6);

        pool.liquidate(loanId);
        assertEq(commodityToken.balanceOf(admin, 1), 105e18);
        vm.stopPrank();
    }

    // =========================================================================
    // ADMIN CONFIGURATION & ROLE ACTIONS
    // =========================================================================

    function test_SetReserveFactor_Revert_InvalidBounds() public {
        vm.startPrank(admin);
        vm.expectRevert(LendingPool__InvalidReserveFactor.selector);
        pool.setReserveFactor(55e16); // > 50% threshold limit
        vm.stopPrank();
    }

    function test_SetReserveFactor_Success() public {
        vm.startPrank(admin);
        pool.setReserveFactor(30e16);
        assertEq(pool.reserveFactor(), 30e16);
        vm.stopPrank();
    }

    function test_SyncCollateralizedStatus_Success() public {
        uint256 loanId = _setupActiveLoan(2_000e6, 100e18);

        vm.mockCall(registry, abi.encodeWithSignature("markCollateralized(uint256)"), "");

        vm.startPrank(admin);
        pool.syncCollateralizedStatus(loanId);
        vm.stopPrank();
    }

    function test_InterestRateModel_KinkBranches() public {
        _fundPoolWithLiquidity(10_000e6);
        _mockRegistryCommodityData(1, farmer);

        // Ensure farmer has plenty of balance for multiple borrows
        commodityToken.setBalance(farmer, 1, 1000e18);
        vm.mockCall(priceOracle, abi.encodeWithSignature("getCollateralValue(uint256,uint256)"), abi.encode(100_000e6));

        vm.prank(farmer);
        pool.borrow(1, 100e18, 200e6);
        uint256 rateLow = pool.getBorrowRate();

        vm.prank(farmer);
        pool.borrow(1, 100e18, 7_000e6); // Push utilization past Kink
        uint256 rateHigh = pool.getBorrowRate();

        assertTrue(rateHigh > rateLow);
    }

    // =========================================================================
    // DEFENSIVE FALLBACK COVERS
    // =========================================================================

    function test_Fallback_Reverts_InvalidCall() public {
        vm.expectRevert(LendingPool__InvalidCall.selector);
        (bool success,) = address(pool).call(abi.encodeWithSignature("nonExistentSignature()"));
        assertTrue(success);
    }

    function test_Receive_Reverts_NativeNotSupported() public {
        vm.expectRevert(bytes("")); // Expect low-level execution to revert natively
        (bool success,) = address(pool).call{value: 1 ether}("");
        assertTrue(!success);
    }

    // =========================================================================
    // INTERNAL ENVIRONMENT SETUP UTILS
    // =========================================================================

    function _fundPoolWithLiquidity(uint256 amount) internal {
        deal(address(usdc), investor, amount);
        vm.startPrank(investor);
        usdc.approve(address(pool), amount);
        pool.deposit(amount);
        vm.stopPrank();
    }

    function _mockRegistryCommodityData(uint256 id, address owner) internal {
        vm.mockCall(registry, abi.encodeWithSignature("isApprovedForBorrowing(uint256)"), abi.encode(true));

        // Define exact types to unpack structural responses for ICommodityRegistry.getCommodity
        bytes memory structuralReturn = abi.encode(
            owner,
            uint8(0),
            uint8(0),
            uint8(0),
            address(0),
            uint96(0),
            uint64(0),
            uint64(0),
            uint64(0),
            uint64(0),
            bytes32(0)
        );
        vm.mockCall(registry, abi.encodeWithSignature("getCommodity(uint256)"), structuralReturn);
    }

    function _setupActiveLoan(uint256 borrowAmount, uint256 collateralAmount) internal returns (uint256 loanId) {
        _fundPoolWithLiquidity(borrowAmount * 10);
        _mockRegistryCommodityData(1, farmer);
        commodityToken.setBalance(farmer, 1, collateralAmount);
        vm.mockCall(
            priceOracle, abi.encodeWithSignature("getCollateralValue(uint256,uint256)"), abi.encode(borrowAmount * 5)
        );

        vm.prank(farmer);
        loanId = pool.borrow(1, collateralAmount, borrowAmount);
    }
}
