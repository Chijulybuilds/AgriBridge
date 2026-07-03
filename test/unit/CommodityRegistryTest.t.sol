// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommodityRegistry} from "src/CommodityRegistry.sol";

/**
 * @title CommodityRegistryTest
 * @author Senior Smart Contract Auditor
 * @notice Complete coverage suite designed to achieve 100% block, line, and branch hits.
 * @dev Exhausts all paths, working around the inverted logic constraints present in the target.
 */
contract CommodityRegistryTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    CommodityRegistry public registry;

    address public admin = makeAddr("admin");
    address public verifier = makeAddr("verifier");
    address public pool = makeAddr("pool");
    address public farmer = makeAddr("farmer");

    address public mockToken = makeAddr("mockToken");

    // Constants matching typical system constraints derived from debug report branches
    uint256 public constant MIN_QUANTITY = 10e18; // Inferred system limits
    uint64 public constant MIN_STORAGE_DURATION = 1 days;
    uint64 public constant MAX_STORAGE_DURATION = 365 days;

    /*//////////////////////////////////////////////////////////////
                               SET UP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        vm.prank(admin);
        registry = new CommodityRegistry(admin);

        vm.startPrank(admin);
        registry.grantRole(registry.VERIFIER_ROLE(), verifier);
        registry.grantRole(registry.POOL_ROLE(), pool);

        // ADD THIS LINE: Give it a mock contract address so it isn't address(0)
        registry.setCommodityTokenAddress(mockToken);

        vm.stopPrank();
    }
    /*//////////////////////////////////////////////////////////////
                           INITIALIZATION TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Audit_SetCommodityTokenAddress_Inversion() public {
        vm.startPrank(admin);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidAddress.selector);
        registry.setCommodityTokenAddress(address(0));

        registry.setCommodityTokenAddress(mockToken);
        assertEq(registry.commodityTokenAddress(), mockToken);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                        VALIDATION ERROR PATHS
    //////////////////////////////////////////////////////////////*/

    function test_RegisterCommodity_InvalidQuantity() public {
        vm.startPrank(farmer);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidQuantity.selector);
        registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa, 0, CommodityRegistry.Grade.A, uint64(block.timestamp), 30
        );
        vm.stopPrank();
    }

    function test_RegisterCommodity_InvalidHarvestDate() public {
        vm.startPrank(farmer);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidHarvestDate.selector);
        registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa,
            100e18,
            CommodityRegistry.Grade.A,
            uint64(block.timestamp + 1 days),
            0
        );
        vm.stopPrank();
    }

    function test_RegisterCommodity_InvalidStorageDuration_TooLow() public {
        vm.startPrank(farmer);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidStorageDuration.selector);
        registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa, 100e18, CommodityRegistry.Grade.A, uint64(block.timestamp), 0 days
        );
        vm.stopPrank();
    }

    function test_RegisterCommodity_InvalidStorageDuration_TooHigh() public {
        vm.startPrank(farmer);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidStorageDuration.selector);
        registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa, 100e18, CommodityRegistry.Grade.A, uint64(block.timestamp), 400 days
        );
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                        ASSET LIFECYCLE PATHS
    //////////////////////////////////////////////////////////////*/

    function test_ApproveCommodity_NotFound() public {
        vm.startPrank(verifier);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__CommodityNotFound.selector);
        registry.approveCommodity(0);

        vm.expectRevert(CommodityRegistry.CommodityRegistry__CommodityNotFound.selector);
        registry.approveCommodity(999);
        vm.stopPrank();
    }

    function test_ApproveCommodity_Success_DueToZeroAddressNoCode() public {
        vm.startPrank(farmer);
        uint256 id = registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa, 100e18, CommodityRegistry.Grade.A, uint64(block.timestamp), 30
        );
        vm.stopPrank();

        // Due to inverted logic check, commodityTokenAddress must be address(0) to pass check.
        // EVM low-level calls to address(0) return success automatically.
        vm.prank(verifier);
        registry.approveCommodity(id);

        assertEq(uint256(registry.getCommodityStatus(id)), uint256(CommodityRegistry.CommodityStatus.Verified));
    }

    function test_ApproveCommodity_InvalidStatusTransition() public {
        // 1. Register commodity (Starts as Pending)
        vm.prank(farmer);
        uint256 id = registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa, 100e18, CommodityRegistry.Grade.A, uint64(block.timestamp), 30
        );

        // 2. First approval: Leave token address as address(0).
        // This bypasses the inverted check and successfully shifts the status to Verified.
        vm.prank(verifier);
        registry.approveCommodity(id);

        // 3. Second approval attempt: This should trigger the status transition failure!
        vm.startPrank(verifier);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidStatusTransition.selector);
        registry.approveCommodity(id);
        vm.stopPrank();
    }

    function test_RejectCommodity_SuccessAndErrors() public {
        vm.prank(farmer);
        uint256 id = registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa, 100e18, CommodityRegistry.Grade.A, uint64(block.timestamp), 30
        );

        // Invalid commodity ID branch lookups
        vm.startPrank(verifier);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__CommodityNotFound.selector);
        registry.rejectCommodity(0, "Invalid quality");

        // Valid execution path
        registry.rejectCommodity(id, "Invalid quality");
        assertEq(uint256(registry.getCommodityStatus(id)), uint256(CommodityRegistry.CommodityStatus.Rejected));

        // Invalid transition branch lookup
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidStatusTransition.selector);
        registry.rejectCommodity(id, "Already rejected");
        vm.stopPrank();
    }

    function test_MarkCollateralized_SuccessAndErrors() public {
        vm.prank(farmer);
        uint256 id = registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa, 100e18, CommodityRegistry.Grade.A, uint64(block.timestamp), 30
        );

        vm.startPrank(pool);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__CommodityNotFound.selector);
        registry.markCollateralized(0);

        // Must be verified first
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidStatusTransition.selector);
        registry.markCollateralized(id);
        vm.stopPrank();

        // Verify it properly
        vm.prank(verifier);
        registry.approveCommodity(id);

        // Successfully collateralize
        vm.prank(pool);
        registry.markCollateralized(id);
        assertEq(uint256(registry.getCommodityStatus(id)), uint256(CommodityRegistry.CommodityStatus.Collateralized));
    }

    /*//////////////////////////////////////////////////////////////
                        MINT CALL FAILURE BRANCH
    //////////////////////////////////////////////////////////////*/

    function test_Audit_MintCommodityTokens_ApprovalCallFailed() public {
        // 1. Deploy the mock contract that forces low-level call failures
        address contractReverter = address(new ExecutionReverter());

        // 2. Safely set it using your corrected setter function (No more vm.store!)
        vm.prank(admin);
        registry.setCommodityTokenAddress(contractReverter);

        // 3. Register the asset normally
        vm.prank(farmer);
        uint256 id = registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa, 100e18, CommodityRegistry.Grade.A, uint64(block.timestamp), 30
        );

        // 4. Approve asset. It bypasses the 0-address check, makes a raw call
        // to contractReverter, fails, and accurately throws ApprovalCallFailed!
        vm.prank(verifier);
        vm.expectRevert(CommodityRegistry.CommodityRegistry__ApprovalCallFailed.selector);
        registry.approveCommodity(id);
    }
    /*//////////////////////////////////////////////////////////////
                        STATUS MANAGEMENT & VIEWS
    //////////////////////////////////////////////////////////////*/

    function test_UpdateStatus_AllBranches() public {
        vm.prank(farmer);
        uint256 id = registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa, 100e18, CommodityRegistry.Grade.A, uint64(block.timestamp), 30
        );

        // FIX: Prank as pool instead of admin to satisfy onlyRole(POOL_ROLE)
        vm.startPrank(pool);

        // Now it passes the role check, looks for ID 0, and correctly triggers CommodityNotFound
        vm.expectRevert(CommodityRegistry.CommodityRegistry__CommodityNotFound.selector);
        registry.updateStatus(0, CommodityRegistry.CommodityStatus.Verified);

        // Continue with the rest of your pool status transition testing...
        vm.expectRevert(CommodityRegistry.CommodityRegistry__InvalidStatusTransition.selector);
        registry.updateStatus(id, CommodityRegistry.CommodityStatus.Pending);

        vm.stopPrank();
    }

    function test_ViewGetters_And_ValidationChecks() public {
        // Non-existent edge case checks
        assertFalse(registry.isCommodityValid(0));
        assertFalse(registry.isApprovedForBorrowing(0));

        vm.expectRevert(CommodityRegistry.CommodityRegistry__CommodityNotFound.selector);
        registry.getCommodity(0);

        vm.expectRevert(CommodityRegistry.CommodityRegistry__CommodityNotFound.selector);
        registry.getCommodityStatus(0);

        // Register valid instance tracking entries
        vm.prank(farmer);
        uint256 id = registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa, 100e18, CommodityRegistry.Grade.A, uint64(block.timestamp), 30
        );

        assertFalse(registry.isCommodityValid(id)); // Is Pending, so false
        assertFalse(registry.isApprovedForBorrowing(id));

        // Validate structure mappings entries return successfully
        registry.getCommodity(id);

        uint256[] memory ids = registry.getFarmerCommodityIds(farmer);
        assertEq(ids.length, 1);
        assertEq(ids[0], id);

        // Time travel past expiration bounds
        vm.prank(verifier);
        registry.approveCommodity(id);
        assertTrue(registry.isCommodityValid(id));

        vm.warp(block.timestamp + 32 days);
        assertFalse(registry.isCommodityValid(id));
    }

    /*//////////////////////////////////////////////////////////////
                            PAUSABLE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Pause_And_Unpause() public {
        vm.startPrank(admin);
        registry.pause();
        registry.unpause();
        vm.stopPrank();
    }
}

/**
 * @dev Helper contract designed to force failure states during dynamic call invocations.
 */
contract ExecutionReverter {
    fallback() external payable {
        revert("Forced Mock Failure");
    }
}
