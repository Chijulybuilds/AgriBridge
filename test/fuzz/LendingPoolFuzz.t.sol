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
 * @title MockUSDC
 * @notice Mock USDC for testing
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("USDC", "USDC") {
        _mint(msg.sender, 1_000_000e6); // 1M USDC
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title LendingPoolFuzzTest
 * @author AgriDeFi Protocol Team
 * @notice Fuzz tests for LendingPool contract
 */
contract LendingPoolFuzzTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE
    //////////////////////////////////////////////////////////////*/

    MockUSDC public usdc;
    CommodityRegistry public registry;
    CommodityPriceOracle public oracle;
    CommodityToken public token;
    LiquidityShareToken public shareToken;
    CommodityVerifier public verifier;
    LendingPool public pool;

    address public investor1 = address(0x1111);
    address public investor2 = address(0x2222);
    address public farmer1 = address(0x3333);
    address public farmer2 = address(0x4444);
    address public verifierAddr = address(0x5555);
    address public owner;

    /*//////////////////////////////////////////////////////////////
                            SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        owner = address(this);

        // Deploy mock USDC
        usdc = new MockUSDC();

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

        // Mint USDC to test accounts
        usdc.mint(investor1, 100_000e6);
        usdc.mint(investor2, 100_000e6);
        usdc.mint(farmer1, 100_000e6);
        usdc.mint(farmer2, 100_000e6);

        // Approve USDC spending
        vm.prank(investor1);
        usdc.approve(address(pool), type(uint256).max);

        vm.prank(investor2);
        usdc.approve(address(pool), type(uint256).max);

        vm.prank(farmer1);
        usdc.approve(address(pool), type(uint256).max);

        vm.prank(farmer2);
        usdc.approve(address(pool), type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                        FUZZ TESTS - DEPOSITS
    //////////////////////////////////////////////////////////////*/

    /// @dev Fuzz test: Deposit random amounts
    function testFuzzDeposit(uint256 amount) public {
        // Bound amount to reasonable range
        amount = bound(amount, 1e6, 10_000e6); // 1 - 10,000 USDC

        vm.prank(investor1);
        pool.depositUSDC(amount);

        assertEq(shareToken.balanceOf(investor1), amount);
        assertEq(pool.totalLiquidity(), amount);
    }

    /// @dev Fuzz test: Multiple deposits
    function testFuzzMultipleDeposits(uint256 amount1, uint256 amount2) public {
        amount1 = bound(amount1, 1e6, 50_000e6);
        amount2 = bound(amount2, 1e6, 50_000e6);

        vm.prank(investor1);
        pool.depositUSDC(amount1);

        vm.prank(investor2);
        pool.depositUSDC(amount2);

        assertEq(pool.totalLiquidity(), amount1 + amount2);
    }

    /*//////////////////////////////////////////////////////////////
                        FUZZ TESTS - BORROW HEALTH FACTOR
    //////////////////////////////////////////////////////////////*/

    /// @dev Fuzz test: Borrow amounts respecting LTV
    function testFuzzBorrowWithinLTV(uint256 collateralAmount) public {
        // Setup: Register and verify commodity
        collateralAmount = bound(collateralAmount, 100e18, 10000e18); // 100-10000 kg

        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity(
            "Cocoa",
            collateralAmount,
            "A",
            65000, // $6500 per 1000kg
            block.timestamp - 10 days,
            180
        );

        // Verify commodity
        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        // Deposit liquidity
        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        // Calculate max borrowable (70% LTV = 0.7)
        // Collateral value = (collateralAmount * 65000) / 1e18
        // Max borrow = collateral value * 0.7
        uint256 collateralValue = (collateralAmount * 65000) / 1e18;
        uint256 maxBorrow = (collateralValue * 70) / 100;

        // Try to borrow within limit
        if (maxBorrow >= 100e6 && maxBorrow <= 100_000e6) {
            vm.prank(farmer1);
            pool.borrowAgainstCommodity(
                commodityId,
                collateralAmount,
                maxBorrow - 1e6 // Just under max
            );

            assertEq(pool.totalBorrowed(), maxBorrow - 1e6);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        FUZZ TESTS - PRICE CHANGES
    //////////////////////////////////////////////////////////////*/

    /// @dev Fuzz test: Price changes affect health factor
    function testFuzzPriceChangesHealthFactor(uint256 newPrice) public {
        newPrice = bound(newPrice, 30000, 100000); // $300 - $1000 per 1000kg

        // Setup
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        vm.prank(farmer1);
        uint256 borrowId = pool.borrowAgainstCommodity(commodityId, 500e18, 20_000e6);

        uint256 hf1 = pool.getHealthFactor(borrowId);

        // Change price
        oracle.setPrice("Cocoa", newPrice);

        uint256 hf2 = pool.getHealthFactor(borrowId);

        // Verify health factor changed
        assertTrue(hf1 != hf2);
    }

    /*//////////////////////////////////////////////////////////////
                        FUZZ TESTS - REPAYMENT
    //////////////////////////////////////////////////////////////*/

    /// @dev Fuzz test: Partial repayments
    function testFuzzPartialRepayment(uint256 repayAmount) public {
        // Setup
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        vm.prank(farmer1);
        uint256 borrowId = pool.borrowAgainstCommodity(commodityId, 500e18, 20_000e6);

        FarmerBorrow memory borrow = pool.getBorrow(borrowId);
        repayAmount = bound(repayAmount, 100e6, borrow.borrowAmount);

        vm.prank(farmer1);
        pool.repay(borrowId, repayAmount);

        FarmerBorrow memory borrowAfter = pool.getBorrow(borrowId);
        assertEq(borrowAfter.borrowAmount, borrow.borrowAmount - repayAmount);
    }

    /*//////////////////////////////////////////////////////////////
                        FUZZ TESTS - INTEREST ACCRUAL
    //////////////////////////////////////////////////////////////*/

    /// @dev Fuzz test: Time passage increases interest
    function testFuzzInterestAccrual(uint256 daysElapsed) public {
        daysElapsed = bound(daysElapsed, 1, 365);

        // Setup
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        vm.prank(farmer1);
        uint256 borrowId = pool.borrowAgainstCommodity(commodityId, 500e18, 20_000e6);

        uint256 interestBefore = pool.getAccruedInterest(borrowId);

        // Fast forward
        vm.warp(block.timestamp + (daysElapsed * 1 days));

        uint256 interestAfter = pool.getAccruedInterest(borrowId);

        // Interest should increase over time
        assertTrue(interestAfter >= interestBefore);
    }

    /*//////////////////////////////////////////////////////////////
                        FUZZ TESTS - LIQUIDATION THRESHOLD
    //////////////////////////////////////////////////////////////*/

    /// @dev Fuzz test: Health factor approaches liquidation
    function testFuzzLiquidationThreshold() public {
        // Setup
        vm.prank(farmer1);
        uint256 commodityId = registry.registerCommodity("Cocoa", 1000e18, "A", 65000, block.timestamp - 10 days, 180);

        vm.prank(address(verifier));
        verifier.verifyCommodity(commodityId);

        vm.prank(investor1);
        pool.depositUSDC(100_000e6);

        // Borrow close to max LTV
        vm.prank(farmer1);
        uint256 borrowId = pool.borrowAgainstCommodity(commodityId, 500e18, 20_000e6);

        uint256 hf = pool.getHealthFactor(borrowId);

        // Health factor should be > 1.0
        assertGt(hf, 1e18);
    }

    /*//////////////////////////////////////////////////////////////
                        HELPER TYPES
    //////////////////////////////////////////////////////////////*/
}
