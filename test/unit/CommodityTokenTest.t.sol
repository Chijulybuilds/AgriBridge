// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommodityToken, ICommodityRegistry} from "src/CommodityToken.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/**
 * @notice Minimal target stub to simulate expected response criteria without layout collision.
 */
contract MockCommodityRegistry is ICommodityRegistry {
    mapping(uint256 => address) private s_idToFarmer;

    function setMockFarmer(uint256 _id, address _farmer) external {
        s_idToFarmer[_id] = _farmer;
    }

    function getCommodity(uint256 _commodityId)
        external
        view
        override
        returns (
            address farmer,
            uint8 status,
            uint8 commodityType,
            uint8 grade,
            address verifier,
            uint96 quantity,
            uint64 harvestDate,
            uint64 registeredAt,
            uint64 storageEndDate,
            uint64 verificationTimestamp,
            bytes32 rejectionReason
        )
    {
        return (s_idToFarmer[_commodityId], 0, 0, 0, address(0), 0, 0, 0, 0, 0, bytes32(0));
    }
}

contract CommodityTokenTest is Test {
    CommodityToken public token;
    MockCommodityRegistry public mockRegistry;

    // Identities & Actor Setup
    address public admin = makeAddr("admin");
    address public registryAddress;
    address public farmer = makeAddr("farmer");
    address public stranger = makeAddr("stranger");

    string public constant INITIAL_URI = "https://api.agribridge.io/metadata/";
    uint256 public constant COMMODITY_ID = 42;
    uint256 public constant MINT_QTY = 1000;

    // Interface Events
    event CommodityTokenMinted(uint256 indexed commodityId, address indexed farmer, uint256 quantity, uint64 timestamp);
    event CommodityTokenBurned(uint256 indexed commodityId, address indexed farmer, uint256 quantity, uint64 timestamp);

    function setUp() public {
        vm.warp(100 weeks); // Advance past block zero timeline thresholds safely

        mockRegistry = new MockCommodityRegistry();
        registryAddress = address(mockRegistry);

        token = new CommodityToken(admin, registryAddress, INITIAL_URI);
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_Success() public view {
        assertEq(token.BaseURI(), INITIAL_URI);
        assertEq(address(token.i_registry()), registryAddress);
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(token.hasRole(token.BURNER_ROLE(), admin));
        assertTrue(token.hasRole(token.MINTER_ROLE(), registryAddress));
    }

    function test_Constructor_Revert_ZeroAdmin() public {
        vm.expectRevert(CommodityToken.CommodityToken__InvalidAddress.selector);
        new CommodityToken(address(0), registryAddress, INITIAL_URI);
    }

    function test_Constructor_Revert_ZeroRegistry() public {
        vm.expectRevert(CommodityToken.CommodityToken__InvalidAddress.selector);
        new CommodityToken(admin, address(0), INITIAL_URI);
    }

    /*//////////////////////////////////////////////////////////////
                            METADATA & VIEWS
    //////////////////////////////////////////////////////////////*/

    function test_SetBaseURI_Success() public {
        string memory newURI = "ipfs://QmNewMetadata/";

        vm.prank(admin);
        token.setBaseURI(newURI);
        assertEq(token.BaseURI(), newURI);
    }

    function test_SetBaseURI_Revert_Unauthorized() public {
        // 1. Tell Foundry to expect the revert from the 'stranger' address
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger, // Make sure this matches the calling address below
                token.DEFAULT_ADMIN_ROLE()
            )
        );

        // 2. Set the prank immediately before the call
        vm.prank(stranger);
        token.setBaseURI("fail");
    }

    function test_Uri_Generation() public view {
        string memory expectation = string.concat(INITIAL_URI, "42.json");
        assertEq(token.uri(COMMODITY_ID), expectation);
    }

    function test_Exists_ReturnsFalseInitially() public view {
        assertFalse(token.exists(COMMODITY_ID));
    }

    /*//////////////////////////////////////////////////////////////
                                 MINT
    //////////////////////////////////////////////////////////////*/

    function test_Mint_Success() public {
        mockRegistry.setMockFarmer(COMMODITY_ID, farmer);

        vm.prank(registryAddress);
        vm.expectEmit(true, true, false, true);
        emit CommodityTokenMinted(COMMODITY_ID, farmer, MINT_QTY, uint64(block.timestamp));

        token.mint(farmer, COMMODITY_ID, MINT_QTY);

        assertTrue(token.exists(COMMODITY_ID));
        assertEq(token.balanceOf(farmer, COMMODITY_ID), MINT_QTY);
    }

    function test_Mint_Revert_ZeroRecipientAddress() public {
        vm.prank(registryAddress);
        vm.expectRevert(CommodityToken.CommodityToken__InvalidAddress.selector);
        token.mint(address(0), COMMODITY_ID, MINT_QTY);
    }

    function test_Mint_Revert_ZeroAmount() public {
        vm.prank(registryAddress);
        vm.expectRevert(CommodityToken.CommodityToken__InvalidQuantity.selector);
        token.mint(farmer, COMMODITY_ID, 0);
    }

    function test_Mint_Revert_TokenAlreadyExists() public {
        mockRegistry.setMockFarmer(COMMODITY_ID, farmer);

        // First structural execution path
        vm.prank(registryAddress);
        token.mint(farmer, COMMODITY_ID, MINT_QTY);

        // Second structural path variant execution block
        vm.prank(registryAddress);
        vm.expectRevert(CommodityToken.CommodityToken__TokenAlreadyExists.selector);
        token.mint(farmer, COMMODITY_ID, MINT_QTY);
    }

    function test_Mint_Revert_CommodityNotFound() public {
        // Enforce the layout records a zero-address mapping layout reference
        mockRegistry.setMockFarmer(COMMODITY_ID, address(0));

        vm.prank(registryAddress);
        vm.expectRevert(CommodityToken.CommodityToken__CommodityNotFound.selector);
        token.mint(farmer, COMMODITY_ID, MINT_QTY);
    }

    function test_Mint_Revert_UnauthorizedTargetFarmer() public {
        mockRegistry.setMockFarmer(COMMODITY_ID, farmer);

        vm.prank(registryAddress);
        vm.expectRevert(CommodityToken.CommodityToken__Unauthorized.selector);
        token.mint(stranger, COMMODITY_ID, MINT_QTY); // stranger != farmer
    }

    function test_Mint_Revert_NotMinterRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, token.MINTER_ROLE()
            )
        );

        vm.prank(stranger);
        token.mint(farmer, COMMODITY_ID, MINT_QTY);
    }
    /*//////////////////////////////////////////////////////////////
                                 BURN
    //////////////////////////////////////////////////////////////*/

    function test_Burn_Success() public {
        mockRegistry.setMockFarmer(COMMODITY_ID, farmer);

        // Allocate collateral balances to clear processing prerequisites
        vm.prank(registryAddress);
        token.mint(farmer, COMMODITY_ID, MINT_QTY);

        vm.prank(admin);
        vm.expectEmit(true, true, false, true);
        emit CommodityTokenBurned(COMMODITY_ID, farmer, MINT_QTY, uint64(block.timestamp));

        token.burn(farmer, COMMODITY_ID, MINT_QTY);
        assertEq(token.balanceOf(farmer, COMMODITY_ID), 0);
    }

    function test_Burn_Revert_ZeroAmount() public {
        vm.prank(admin);
        vm.expectRevert(CommodityToken.CommodityToken__InvalidQuantity.selector);
        token.burn(farmer, COMMODITY_ID, 0);
    }

    function test_Burn_Revert_NotBurnerRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, token.BURNER_ROLE()
            )
        );

        vm.prank(stranger);
        token.burn(farmer, COMMODITY_ID, MINT_QTY);
    }

    /*//////////////////////////////////////////////////////////////
                            PAUSABLE LOCKS
    //////////////////////////////////////////////////////////////*/

    function test_Pause_And_Unpause_SystemLocks() public {
        vm.startPrank(admin);
        token.pause();

        // Validate emergency pause exception triggers across state modification pathways
        vm.stopPrank();

        mockRegistry.setMockFarmer(COMMODITY_ID, farmer);

        vm.prank(registryAddress);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        token.mint(farmer, COMMODITY_ID, MINT_QTY);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        token.burn(farmer, COMMODITY_ID, MINT_QTY);

        // Reopen protocol tracking layers
        vm.prank(admin);
        token.unpause();

        vm.prank(registryAddress);
        token.mint(farmer, COMMODITY_ID, MINT_QTY);
        assertEq(token.balanceOf(farmer, COMMODITY_ID), MINT_QTY);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERFACE SUPPORT
    //////////////////////////////////////////////////////////////*/

    function test_SupportsInterface() public view {
        // Verification of typical ERC165 interface configuration boundaries
        assertTrue(token.supportsInterface(0xd9b67a26)); // ERC1155 Interface ID
        assertTrue(token.supportsInterface(0x7965db0b)); // AccessControl Interface ID
        assertFalse(token.supportsInterface(0xffffffff)); // Invalid ID
    }
}
