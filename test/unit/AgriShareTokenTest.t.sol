// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/*//////////////////////////////////////////////////////////////
                            MOCK ERC20
//////////////////////////////////////////////////////////////*/

/**
 * @title MockUSDC
 * @notice Standard ERC20 mock configured to return custom decimals to satisfy constructor metadata calls.
 */
contract MockUSDC is ERC20 {
    uint8 private immutable i_mockDecimals;

    constructor(string memory name, string memory symbol, uint8 _decimalsValue) ERC20(name, symbol) {
        i_mockDecimals = _decimalsValue;
    }

    function decimals() public view override returns (uint8) {
        return i_mockDecimals;
    }
}

/*//////////////////////////////////////////////////////////////
                         TEST CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title AgriShareTokenTest
 * @author Chinedu Prince (AgriBridge Team)
 * @dev Formal validation suite addressing 100% branch and statement coverage for AgriShareToken.
 * @notice This tests reflects across all other functions and branches in the AgriShare Token
 */
contract AgriShareTokenTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    AgriShareToken public shareToken;
    MockUSDC public mockUsdc;

    address public lendingPool = address(0xBA5E);
    address public maliciousUser = address(0xBAD);
    address public liquidityProvider = address(0x600D);

    uint8 public constant TOKEN_DECIMALS = 6;
    uint256 public constant INITIAL_MINT_AMOUNT = 1_000e6;

    // Events mirrored for target verification checks
    event SharesMinted(address indexed investor, uint256 amount, uint256 timestamp);
    event SharesBurned(address indexed investor, uint256 amount, uint256 timestamp);

    /**
     * @notice Architecture configuration pipeline acting as the project deployer environment setup.
     */
    function setUp() public {
        // Deploy dynamic underlying metadata asset instance
        mockUsdc = new MockUSDC("Mock USDC", "USDC", TOKEN_DECIMALS);

        // Deploy the main target contract under investigation. This test contract is therefore the
        // owner, and is the only address permitted to perform the one-time lending pool wiring.
        shareToken = new AgriShareToken(address(mockUsdc), "AgriDeFi LP Receipt Token", "agLP");

        // Wire the pool that is allowed to mint and burn shares. Without this every mint and burn
        // reverts with NotLendingPool, since `lendingPool` defaults to address(0).
        shareToken.setLendingPool(lendingPool);
    }

    /*//////////////////////////////////////////////////////////////
                        CONSTRUCTOR VALIDATIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Validates constructor logic correctly fetches dynamic decimals from underlying ERC20 metadata.
     * @dev Targets Statement (location: lines 80..81, bytes: 3238..3283) -> "i_decimals = IERC20Metadata(_usdc).decimals()"
     */
    function test_ConstructorSetsDynamicDecimalsCorrectly() public view {
        assertEq(shareToken.decimals(), TOKEN_DECIMALS);
    }

    /**
     * @notice Deploying against a zero-address underlying asset must revert.
     * @dev The constructor only validates `_usdc`; the lending pool is wired separately afterwards,
     *      so a valid-USDC deployment is expected to succeed rather than revert.
     */
    function test_ConstructorRejectsZeroAddresses() public {
        vm.expectRevert(AgriShareToken.AgriShareToken__InvalidAddress.selector);
        new AgriShareToken(address(0), "Test", "TST");
    }

    /*//////////////////////////////////////////////////////////////
                     LENDING POOL WIRING ACCESS CONTROL
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice The owner can wire the pool exactly once, and the address sticks.
     */
    function test_SetLendingPool_SetsAddressForOwner() public {
        AgriShareToken fresh = new AgriShareToken(address(mockUsdc), "Test", "TST");
        assertEq(fresh.lendingPool(), address(0));

        fresh.setLendingPool(lendingPool);

        assertEq(fresh.lendingPool(), lendingPool);
        assertEq(fresh.i_owner(), address(this));
    }

    /**
     * @notice Regression: a non-owner must not be able to wire the pool.
     * @dev Previously `setLendingPool` had no access control, so any address could repoint it at a
     *      contract it controlled and mint unlimited shares against pool liquidity.
     */
    function test_SetLendingPool_RevertsForNonOwner() public {
        AgriShareToken fresh = new AgriShareToken(address(mockUsdc), "Test", "TST");

        vm.prank(maliciousUser);
        vm.expectRevert(AgriShareToken.AgriShareToken__MustBeTheOwner.selector);
        fresh.setLendingPool(maliciousUser);

        assertEq(fresh.lendingPool(), address(0));
    }

    /**
     * @notice Regression: wiring is one-shot, so even the owner cannot repoint it after deployment.
     */
    function test_SetLendingPool_RevertsWhenAlreadySet() public {
        vm.expectRevert(AgriShareToken.AgriShareToken__LendingPoolAlreadySet.selector);
        shareToken.setLendingPool(maliciousUser);

        assertEq(shareToken.lendingPool(), lendingPool);
    }

    /**
     * @notice The pool address itself must be non-zero.
     */
    function test_SetLendingPool_RevertsOnZeroAddress() public {
        AgriShareToken fresh = new AgriShareToken(address(mockUsdc), "Test", "TST");

        vm.expectRevert(AgriShareToken.AgriShareToken__InvalidLendingPoolAddress.selector);
        fresh.setLendingPool(address(0));
    }

    /*//////////////////////////////////////////////////////////////
                       ROLE ENFORCEMENT MODIFIER
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Assures non-lending pool entry points are immediately blocked via the onlyRoleEnforced modifier.
     * @dev Targets Branch (branch: 0, path: 0) (location: lines 55..56, bytes: 2331..2370)
     */
    function test_ModifierOnlyRoleEnforcedRevertsOnUnauthorizedAccess() public {
        vm.startPrank(maliciousUser);

        // Try to access mintShares
        vm.expectRevert(AgriShareToken.AgriShareToken__NotLendingPool.selector);
        shareToken.mintShares(liquidityProvider, INITIAL_MINT_AMOUNT);

        // Try to access burnShares
        vm.expectRevert(AgriShareToken.AgriShareToken__NotLendingPool.selector);
        shareToken.burnShares(liquidityProvider, INITIAL_MINT_AMOUNT);

        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                        VALIDATION CHECK MODIFIER
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Assures that mint operations targeting the zero address are blocked at the modifier barrier.
     * @dev Targets Branch (branch: 1, path: 0) (location: lines 60..61, bytes: 2492..2531)
     */
    function test_ValidationCheckRejectsZeroAddressRecipient() public {
        vm.startPrank(lendingPool);

        vm.expectRevert(AgriShareToken.AgriShareToken__InvalidAddress.selector);
        shareToken.mintShares(address(0), INITIAL_MINT_AMOUNT);
        vm.stopPrank();
    }

    /**
     * @notice Assures that mint operations attempting to specify a zero amount parameters are blocked.
     * @dev Targets Branch (branch: 2, path: 0) (location: lines 61..62, bytes: 2559..2597)
     */
    function test_ValidationCheckRejectsZeroAmountMintOrBurn() public {
        vm.startPrank(lendingPool);

        // Verify Mint Zero Amount Check
        vm.expectRevert(AgriShareToken.AgriShareToken__InvalidAmount.selector);
        shareToken.mintShares(liquidityProvider, 0);

        // Verify Burn Zero Amount Check
        vm.expectRevert(AgriShareToken.AgriShareToken__InvalidAmount.selector);
        shareToken.burnShares(liquidityProvider, 0);

        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                             MINT & BURN
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Assures execution workflow successfully processes mint actions under valid caller constraints.
     * @dev Targets lines 92..96 for function mintShares execution and event tracking.
     */
    function test_MintSharesSucceedsAndEmitsEvent() public {
        vm.startPrank(lendingPool);

        vm.expectEmit(true, false, false, true);
        emit SharesMinted(liquidityProvider, INITIAL_MINT_AMOUNT, block.timestamp);

        shareToken.mintShares(liquidityProvider, INITIAL_MINT_AMOUNT);

        assertEq(shareToken.balanceOf(liquidityProvider), INITIAL_MINT_AMOUNT);
        vm.stopPrank();
    }

    /**
     * @notice Assures execution workflow successfully processes burn actions under valid caller constraints.
     * @dev Targets lines 102..106 for function burnShares execution and event tracking.
     */
    function test_BurnSharesSucceedsAndEmitsEvent() public {
        vm.startPrank(lendingPool);

        // Initial pool allocation context setup
        shareToken.mintShares(liquidityProvider, INITIAL_MINT_AMOUNT);

        // Execution and emission check
        vm.expectEmit(true, false, false, true);
        emit SharesBurned(liquidityProvider, INITIAL_MINT_AMOUNT, block.timestamp);

        shareToken.burnShares(liquidityProvider, INITIAL_MINT_AMOUNT);

        assertEq(shareToken.balanceOf(liquidityProvider), 0);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                      SOULBOUND TRANSFER OVERRIDES
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Verifies that user-to-user transfers are fully blocked by the overridden internal update mechanism.
     * @dev Targets Branch (branch: 4, path: 0) (location: lines 128..131, bytes: 5393..5459) -> "revert AgriShareToken__TransferDisabled()"
     */
    function test_TransferRevertsUserToUser() public {
        // Setup state: Mint tokens to liquidity provider first
        vm.prank(lendingPool);
        shareToken.mintShares(liquidityProvider, INITIAL_MINT_AMOUNT);

        // Execution phase: Attempt user-to-user transfer
        vm.prank(liquidityProvider);
        vm.expectRevert(AgriShareToken.AgriShareToken__TransferDisabled.selector);
        shareToken.transfer(maliciousUser, 100e6);
    }

    /**
     * @notice Verifies that transfer restrictions bypass minting and burning architectures.
     * @dev Confirms internal `_update` logic conditionally lets address(0) boundaries bypass restriction branches.
     */
    function test_TransferAllowsMintAndBurn() public {
        vm.startPrank(lendingPool);

        // Mint is technically a transfer from address(0) to liquidityProvider
        shareToken.mintShares(liquidityProvider, 200e6);
        assertEq(shareToken.balanceOf(liquidityProvider), 200e6);

        // Burn is technically a transfer from liquidityProvider to address(0)
        shareToken.burnShares(liquidityProvider, 200e6);
        assertEq(shareToken.balanceOf(liquidityProvider), 0);

        vm.stopPrank();
    }
}
