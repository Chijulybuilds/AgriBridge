// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityToken} from "src/CommodityToken.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

contract CommodityTokenTest is ProtocolFixture {
    CommodityToken internal token;

    address internal buyer = makeAddr("buyer");
    address internal regulator = makeAddr("regulator");
    address internal burner = makeAddr("burner");
    address internal protocol = makeAddr("protocol");

    uint96 internal constant KG = 1_000e18;

    function setUp() public {
        _deployFixture();
        token = d.commodityToken;
        d.registry.grantRole(d.registry.REGULATOR_ROLE(), regulator);
        token.grantRole(token.BURNER_ROLE(), burner);
        token.grantRole(token.PROTOCOL_ROLE(), protocol);
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_OnlyTheRegistryMints() public view {
        assertTrue(token.hasRole(token.MINTER_ROLE(), address(d.registry)));
        assertFalse(token.hasRole(token.MINTER_ROLE(), address(this)));
        assertFalse(token.hasRole(token.BURNER_ROLE(), address(this)), "admin cannot burn holders' tokens");
        assertEq(address(token.i_registry()), address(d.registry));
    }

    function test_Constructor_Revert_ZeroAddresses() public {
        vm.expectRevert(CommodityToken.CommodityToken__InvalidAddress.selector);
        new CommodityToken(address(0), d.registry);

        vm.expectRevert(CommodityToken.CommodityToken__InvalidAddress.selector);
        new CommodityToken(address(this), CommodityRegistry(address(0)));
    }

    /*//////////////////////////////////////////////////////////////
                                  MINT
    //////////////////////////////////////////////////////////////*/

    function test_Mint_HappensOnApproval() public {
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);
        assertEq(token.balanceOf(farmer, lotId), KG);
        assertEq(token.totalSupply(lotId), KG);
        assertTrue(token.exists(lotId));
    }

    function test_Mint_Revert_NotMinter() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), token.MINTER_ROLE()
            )
        );
        token.mint(farmer, 1, KG);
    }

    function test_Mint_Revert_WrongFarmerOrTwice() public {
        vm.prank(farmer);
        uint256 lotId = d.registry.requestIntake(COCOA, KG, warehouseId, uint64(block.timestamp));

        vm.startPrank(address(d.registry));
        vm.expectRevert(CommodityToken.CommodityToken__Unauthorized.selector);
        token.mint(buyer, lotId, KG);

        token.mint(farmer, lotId, KG);
        vm.expectRevert(CommodityToken.CommodityToken__TokenAlreadyExists.selector);
        token.mint(farmer, lotId, KG);

        vm.expectRevert(CommodityToken.CommodityToken__InvalidQuantity.selector);
        token.mint(farmer, lotId + 1, 0);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                                  BURN
    //////////////////////////////////////////////////////////////*/

    function test_Burn_ByBurnerRole() public {
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);

        vm.prank(burner);
        token.burn(farmer, lotId, 300e18);
        assertEq(token.balanceOf(farmer, lotId), 700e18);
        assertEq(token.totalSupply(lotId), 700e18);
    }

    function test_Burn_Revert_NotBurnerOrZero() public {
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), token.BURNER_ROLE()
            )
        );
        token.burn(farmer, lotId, 1e18);

        vm.expectRevert(CommodityToken.CommodityToken__InvalidQuantity.selector);
        vm.prank(burner);
        token.burn(farmer, lotId, 0);
    }

    /*//////////////////////////////////////////////////////////////
                             FROZEN LOTS
    //////////////////////////////////////////////////////////////*/

    function test_Transfer_UnfrozenLotMovesFreely() public {
        uint256 lotId = _verifiedLot(farmer, RICE, KG, CommodityRegistry.Grade.A);

        vm.prank(farmer);
        token.safeTransferFrom(farmer, buyer, lotId, 250e18, "");
        assertEq(token.balanceOf(buyer, lotId), 250e18);
    }

    function test_Transfer_Revert_FrozenLotBetweenUsers() public {
        uint256 lotId = _verifiedLot(farmer, RICE, KG, CommodityRegistry.Grade.A);
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);

        vm.expectRevert(abi.encodeWithSelector(CommodityToken.CommodityToken__LotFrozen.selector, lotId));
        vm.prank(farmer);
        token.safeTransferFrom(farmer, buyer, lotId, 250e18, "");

        // Not into a protocol contract either: a frozen lot cannot start a loan or a listing.
        vm.expectRevert(abi.encodeWithSelector(CommodityToken.CommodityToken__LotFrozen.selector, lotId));
        vm.prank(farmer);
        token.safeTransferFrom(farmer, protocol, lotId, 250e18, "");
    }

    function test_Transfer_ProtocolCanHandAFrozenLotBack() public {
        uint256 lotId = _verifiedLot(farmer, RICE, KG, CommodityRegistry.Grade.A);
        vm.prank(farmer);
        token.safeTransferFrom(farmer, protocol, lotId, KG, ""); // e.g. locked in a loan

        vm.prank(regulator);
        d.registry.setWarehouseFrozen(warehouseId, true);

        vm.prank(protocol);
        token.safeTransferFrom(protocol, farmer, lotId, KG, ""); // e.g. the loan is repaid
        assertEq(token.balanceOf(farmer, lotId), KG);
    }

    function test_Transfer_Revert_WhenPaused() public {
        uint256 lotId = _verifiedLot(farmer, RICE, KG, CommodityRegistry.Grade.A);
        token.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(farmer);
        token.safeTransferFrom(farmer, buyer, lotId, 1e18, "");
    }

    /*//////////////////////////////////////////////////////////////
                                METADATA
    //////////////////////////////////////////////////////////////*/

    function test_Metadata_DescribesTheLotOnChain() public {
        uint256 lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.B);
        string memory json = token.tokenMetadata(lotId);

        assertEq(vm.parseJsonString(json, ".name"), "Agri-Cashew lot #1");
        assertEq(vm.parseJsonString(json, ".attributes[0].value"), "Cashew");
        assertEq(vm.parseJsonString(json, ".attributes[1].value"), "1000");
        assertEq(vm.parseJsonString(json, ".attributes[2].value"), "B");
        assertEq(vm.parseJsonString(json, ".attributes[3].value"), "B");
        assertEq(vm.parseJsonString(json, ".attributes[4].value"), "Test Warehouse");
        assertEq(vm.parseJsonString(json, ".attributes[5].value"), "Oyo, Nigeria");
        assertEq(vm.parseJsonUint(json, ".attributes[6].value"), block.timestamp);
        assertEq(vm.parseJsonUint(json, ".attributes[7].value"), d.registry.expiresAt(lotId));
        assertEq(vm.parseJsonString(json, ".attributes[8].value"), vm.toString(EVIDENCE));
    }

    function test_Metadata_CurrentGradeFollowsAge() public {
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);
        vm.warp(block.timestamp + 200 days);

        string memory json = token.tokenMetadata(lotId);
        assertEq(vm.parseJsonString(json, ".attributes[2].value"), "A", "grade at intake");
        assertEq(vm.parseJsonString(json, ".attributes[3].value"), "B", "current grade");
    }

    function test_Metadata_EscapesWarehouseNames() public {
        d.registry.updateWarehouse(warehouseId, 'The "Big" Store', "Oyo", WAREHOUSE_CAPACITY, true);
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);

        assertEq(vm.parseJsonString(token.tokenMetadata(lotId), ".attributes[4].value"), 'The "Big" Store');
    }

    function test_Uri_IsABase64DataUri() public {
        uint256 lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);
        bytes memory uri = bytes(token.uri(lotId));
        bytes memory prefix = bytes("data:application/json;base64,");

        assertGt(uri.length, prefix.length);
        for (uint256 i = 0; i < prefix.length; i++) {
            assertEq(uri[i], prefix[i]);
        }
    }

    function test_SupportsInterface() public view {
        assertTrue(token.supportsInterface(type(IERC1155).interfaceId));
        assertTrue(token.supportsInterface(type(IAccessControl).interfaceId));
    }
}
