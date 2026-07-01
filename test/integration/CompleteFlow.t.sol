// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/LendingPool.sol";
import "../../src/CommodityRegistry.sol";
import "../../src/CommodityPriceOracle.sol";
import "../../src/CommodityToken.sol";
import "../../src/LiquidityShareToken.sol";
import "../../src/CommodityVerifier.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC2
 * @notice Mock USDC for testing
 */
contract MockUSDC2 is ERC20 {
    constructor() ERC20("USDC", "USDC") {
        _mint(msg.sender, 10_000_000e6);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title IntegrationTest
 * @author AgriDeFi Protocol Team
 * @notice Integration tests for complete user flows
 */
contract IntegrationTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE
    //////////////////////////////////////////////////////////////*/

    MockUSDC2 public usdc;
    CommodityRegistry public registry;
    CommodityPriceOracle public oracle;
    CommodityToken public token;
    LiquidityShareToken public shareToken;
    CommodityVerifier public verifier;
    LendingPool public pool;

    address public investor1 = address(0x1111);
    address public farmer1 = address(0x3333);
    address public verifierAddr = address(0x5555);
    address public liquidator = address(0x6666);

    /*//////////////////////////////////////////////////////////////
                            SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC2();

        // Deploy core contracts
        registry = new CommodityRegistry();
        oracle = new CommodityPriceOracle();
        token = new CommodityToken("ipfs://QmXxxx", address(0), address(0));
        shareToken = new LiquidityShareToken(address(0));
        pool = new LendingPool(address(usdc), address(registry), address(token), address(shareToken), address(oracle));

        verifier = new CommodityVerifier(address(registry), address(token));

        // Wire permissions
        token.setVerifier(address(verifier));
        token.setLendingPool(address(pool));
        shareToken.setLendingPool(address(pool));
        registry.addVerifier(address(verifier));

        // Mint USDC
        usdc.mint(investor1, 1_000_000e6);
        usdc.mint(farmer1, 1_000_000e6);
        usdc.mint(liquidator, 1_000_000e6);

        // Approve spending
        vm.prank(investor1);
        usdc.approve(address(pool), type(uint256).max);

        vm.prank(farmer1);
        usdc.approve(address(pool), type(uint256).max);

        vm.prank(liquidator);
        usdc.approve(address(pool), type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                    INTEGRATION TEST 1: DEPOSIT FLOW
    //////////////////////////////////////////////////////////////*/

    function testDepositFlow() public {
        // Investor deposits USDC
        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        // Check balances
        assertEq(shareToken.balanceOf(investor1), 100_000e6);
        assertEq(pool.totalLiquidity(), 100_000e6);
        assertEq(usdc.balanceOf(address(pool)), 100_000e6);
    }

    /*//////////////////////////////////////////////////////////////
                    INTEGRATION TEST 2: COMMODITY REGISTRATION
    //////////////////////////////////////////////////////////////*/

    function testCommodityRegistrationFlow() public {
        // Farmer registers commodity
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity(
            "Cocoa",
            1000e18, // 1000 kg
            "A",
            65000, // $6500
            block.timestamp - 10 days,
            180 // 180 days storage
        );

        // Check commodity exists
        CommodityRegistry.Commodity memory commodity = registry.getCommodity(commodityId);
        assertEq(commodity.farmer, farmer1);
        assertEq(commodity.name, "Cocoa");
        assertEq(commodity.status, CommodityRegistry.CommodityStatus.PENDING);
    }

    /*//////////////////////////////////////////////////////////////
                    INTEGRATION TEST 3: VERIFICATION FLOW
    //////////////////////////////////////////////////////////////*/

    function testVerificationFlow() public {
        // Register commodity
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        // Verify commodity
        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        // Check commodity is verified
        CommodityRegistry.Commodity memory commodity = registry.getCommodity(commodityId);
        assertEq(commodity.status, CommodityRegistry.CommodityStatus.VERIFIED);

        // Check tokens were minted to farmer
        assertEq(token.balanceOf(farmer1, 1), 1000e18);
    }

    /*//////////////////////////////////////////////////////////////
                    INTEGRATION TEST 4: BORROW FLOW
    //////////////////////////////////////////////////////////////*/

    function testBorrowFlow() public {
        // Step 1: Investor deposits USDC
        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        // Step 2: Farmer registers commodity
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        // Step 3: Verifier approves commodity
        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        // Step 4: Farmer borrows against commodity
        vm.prank(farmer1);
        uint256 borrowId = pool.borrowAgainstCommodity(
            commodityId,
            500e18, // 500 kg collateral
            20_000e6 // 20,000 USDC borrow
        );

        // Check borrow state
        LendingPool.FarmerBorrow memory borrow = pool.getBorrow(borrowId);
        assertEq(borrow.farmer, farmer1);
        assertEq(borrow.borrowAmount, 20_000e6);
        assertEq(borrow.collateralAmount, 500e18);
        assertEq(borrow.status, LendingPool.BorrowStatus.ACTIVE);

        // Check farmer received USDC
        assertEq(usdc.balanceOf(farmer1), 1_020_000e6); // 1M + 20K

        // Check collateral is locked
        assertEq(token.getLockedBalance(farmer1, 1), 500e18);
    }

    /*//////////////////////////////////////////////////////////////
                    INTEGRATION TEST 5: REPAYMENT FLOW
    //////////////////////////////////////////////////////////////*/

    function testRepaymentFlow() public {
        // Setup: Investor deposits, farmer borrows
        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        vm.prank(farmer1);
        uint256 borrowId = pool.borrowAgainstCommodity(commodityId, 500e18, 20_000e6);

        // Farmer repays loan (with interest)
        vm.prank(farmer1);
        pool.repay(borrowId, 20_100e6); // Principal + interest

        // Check loan is repaid
        LendingPool.FarmerBorrow memory borrow = pool.getBorrow(borrowId);
        assertEq(borrow.borrowAmount, 0);
        assertEq(borrow.status, LendingPool.BorrowStatus.REPAID);

        // Check collateral is unlocked
        assertEq(token.getLockedBalance(farmer1, 1), 0);
    }

    /*//////////////////////////////////////////////////////////////
                    INTEGRATION TEST 6: LIQUIDATION FLOW
    //////////////////////////////////////////////////////////////*/

    function testLiquidationFlow() public {
        // Setup: Investor deposits, farmer borrows
        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        vm.prank(farmer1);
        uint256 borrowId = pool.borrowAgainstCommodity(
            commodityId,
            500e18,
            30_000e6 // High borrow
        );

        // Crash the price to trigger liquidation
        oracle.setPrice("Cocoa", 20000); // $200 per 1000kg (down from $650)

        // Check health factor is below 1.0
        uint256 hf = pool.getHealthFactor(borrowId);
        assertLt(hf, 1e18);

        // Liquidator liquidates the loan
        vm.prank(liquidator);
        pool.liquidate(borrowId);

        // Check loan is liquidated
        LendingPool.FarmerBorrow memory borrow = pool.getBorrow(borrowId);
        assertEq(borrow.status, LendingPool.BorrowStatus.LIQUIDATED);
    }

    /*//////////////////////////////////////////////////////////////
                    INTEGRATION TEST 7: MULTIPLE USERS
    //////////////////////////////////////////////////////////////*/

    function testMultipleUsersFlow() public {
        address investor2 = address(0x7777);
        address farmer2 = address(0x8888);

        // Setup
        usdc.mint(investor2, 500_000e6);
        usdc.mint(farmer2, 500_000e6);

        vm.prank(investor2);
        usdc.approve(address(pool), type(uint256).max);

        vm.prank(farmer2);
        usdc.approve(address(pool), type(uint256).max);

        // Multiple investors deposit
        vm.prank(investor1);
        pool.depositUSDC(50_000e6);

        vm.prank(investor2);
        pool.depositUSDC(50_000e6);

        assertEq(pool.totalLiquidity(), 100_000e6);

        // Multiple farmers borrow
        // Farmer 1
        vm.prank(farmer1);
        uint256 commodity1 = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodity1);

        vm.prank(farmer1);
        pool.borrowAgainstCommodity(commodity1, 300e18, 15_000e6);

        // Farmer 2
        vm.prank(farmer2);
        uint256 commodity2 =
            registry.registerCommodity("Rice", 500e18, "Standard", 70000, block.timestamp - 5 days, 365);

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodity2);

        vm.prank(farmer2);
        pool.borrowAgainstCommodity(commodity2, 200e18, 10_000e6);

        assertEq(pool.totalBorrowed(), 25_000e6);
    }

    /*//////////////////////////////////////////////////////////////
                    INTEGRATION TEST 8: PAUSE/RESUME
    //////////////////////////////////////////////////////////////*/

    function testPauseResumeFlow() public {
        vm.prank(investor1);
        pool.depositUSDC(50_000e6);

        // Pause pool
        pool.pause();
        assertEq(pool.isPaused(), true);

        // Cannot deposit while paused
        vm.prank(investor1);
        vm.expectRevert(LendingPool.PoolPausedError.selector);
        pool.depositUSDC(10_000e6);

        // Resume pool
        pool.unpause();
        assertEq(pool.isPaused(), false);

        // Can deposit again
        vm.prank(investor1);
        pool.depositUSDC(10_000e6);

        assertEq(pool.totalLiquidity(), 60_000e6);
    }

    /*//////////////////////////////////////////////////////////////
                    INTEGRATION TEST 9: WITHDRAWAL FLOW
    //////////////////////////////////////////////////////////////*/

    function testWithdrawalFlow() public {
        // Deposit
        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        assertEq(shareToken.balanceOf(investor1), 100_000e6);

        // Withdraw
        vm.prank(investor1);
        pool.withdrawUSDC(50_000e6);

        assertEq(shareToken.balanceOf(investor1), 50_000e6);
        assertEq(usdc.balanceOf(investor1), 950_000e6);
        assertEq(pool.totalLiquidity(), 50_000e6);
    }

    /*//////////////////////////////////////////////////////////////
                    INTEGRATION TEST 10: EDGE CASE - EXPIRED COMMODITY
    //////////////////////////////////////////////////////////////*/

    function testExpiredCommodityFlow() public {
        // Setup
        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity(
            "Cocoa",
            1000e18,
            "A",
            65000,
            block.timestamp - 10 days,
            1 // 1 day storage only
        );

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        // Fast forward past storage end date
        vm.warp(block.timestamp + 2 days);

        // Cannot borrow with expired commodity
        vm.prank(farmer1);
        vm.expectRevert(LendingPool.CommodityExpired.selector);
        pool.borrowAgainstCommodity(commodityId, 500e18, 20_000e6);
    }
}
