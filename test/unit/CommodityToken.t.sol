// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/CommodityToken.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

/**
 * @title CommodityTokenTest
 * @author AgriDeFi Protocol Team
 * @notice Unit tests for CommodityToken (ERC1155) contract
 */
contract CommodityTokenTest is Test, IERC1155Receiver {
    /*//////////////////////////////////////////////////////////////
                            STATE
    //////////////////////////////////////////////////////////////*/

    CommodityToken public token;
    address public verifier = address(0x1111);
    address public lendingPool = address(0x2222);
    address public farmer = address(0x3333);
    address public owner;

    /*//////////////////////////////////////////////////////////////
                            SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        owner = address(this);
        token = new CommodityToken("ipfs://QmXxxx", verifier, lendingPool);
    }

    /*//////////////////////////////////////////////////////////////
                        MINTING TESTS
    //////////////////////////////////////////////////////////////*/

    function testMintTokens() public {
        vm.prank(verifier);
        token.mint(farmer, 1, 1000e18, "");

        assertEq(token.balanceOf(farmer, 1), 1000e18);
    }

    function testOnlyVerifierCanMint() public {
        address unauthorized = address(0x4444);

        vm.prank(unauthorized);
        vm.expectRevert(CommodityToken.OnlyVerifierCanMint.selector);
        token.mint(farmer, 1, 1000e18, "");
    }

    function testMintInvalidAmount() public {
        vm.prank(verifier);
        vm.expectRevert(CommodityToken.InvalidQuantity.selector);
        token.mint(farmer, 1, 0, "");
    }

    /*//////////////////////////////////////////////////////////////
                        COLLATERAL LOCK TESTS
    //////////////////////////////////////////////////////////////*/

    function testLockCollateral() public {
        // First mint tokens
        vm.prank(verifier);
        token.mint(farmer, 1, 1000e18, "");

        // Then lock them
        vm.prank(lendingPool);
        token.lockCollateral(farmer, 1, 500e18);

        assertEq(token.getLockedBalance(farmer, 1), 500e18);
        assertEq(token.getAvailableBalance(farmer, 1), 500e18);
    }

    function testOnlyLendingPoolCanLock() public {
        vm.prank(verifier);
        token.mint(farmer, 1, 1000e18, "");

        address unauthorized = address(0x4444);
        vm.prank(unauthorized);
        vm.expectRevert(CommodityToken.OnlyLendingPoolCanLock.selector);
        token.lockCollateral(farmer, 1, 500e18);
    }

    function testLockInsufficientBalance() public {
        vm.prank(verifier);
        token.mint(farmer, 1, 1000e18, "");

        vm.prank(lendingPool);
        vm.expectRevert(CommodityToken.InsufficientBalance.selector);
        token.lockCollateral(farmer, 1, 2000e18); // More than available
    }

    function testUnlockCollateral() public {
        vm.prank(verifier);
        token.mint(farmer, 1, 1000e18, "");

        vm.prank(lendingPool);
        token.lockCollateral(farmer, 1, 500e18);

        vm.prank(lendingPool);
        token.unlockCollateral(farmer, 1, 300e18);

        assertEq(token.getLockedBalance(farmer, 1), 200e18);
        assertEq(token.getAvailableBalance(farmer, 1), 800e18);
    }

    /*//////////////////////////////////////////////////////////////
                        TRANSFER TESTS
    //////////////////////////////////////////////////////////////*/

    function testCannotTransferLockedTokens() public {
        vm.prank(verifier);
        token.mint(farmer, 1, 1000e18, "");

        vm.prank(lendingPool);
        token.lockCollateral(farmer, 1, 500e18);

        address recipient = address(0x5555);

        vm.prank(farmer);
        vm.expectRevert(CommodityToken.InsufficientBalance.selector);
        token.safeTransferFrom(farmer, recipient, 1, 600e18, "");
    }

    function testTransferAvailableTokens() public {
        vm.prank(verifier);
        token.mint(farmer, 1, 1000e18, "");

        address recipient = address(0x5555);

        vm.prank(farmer);
        token.safeTransferFrom(farmer, recipient, 1, 500e18, "");

        assertEq(token.balanceOf(recipient, 1), 500e18);
        assertEq(token.balanceOf(farmer, 1), 500e18);
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTION TESTS
    //////////////////////////////////////////////////////////////*/

    function testGetAvailableBalance() public {
        vm.prank(verifier);
        token.mint(farmer, 1, 1000e18, "");

        assertEq(token.getAvailableBalance(farmer, 1), 1000e18);

        vm.prank(lendingPool);
        token.lockCollateral(farmer, 1, 600e18);

        assertEq(token.getAvailableBalance(farmer, 1), 400e18);
    }

    function testHasSufficientBalance() public {
        vm.prank(verifier);
        token.mint(farmer, 1, 1000e18, "");

        assertEq(token.hasSufficientBalance(farmer, 1, 500e18), true);
        assertEq(token.hasSufficientBalance(farmer, 1, 1500e18), false);

        vm.prank(lendingPool);
        token.lockCollateral(farmer, 1, 600e18);

        assertEq(token.hasSufficientBalance(farmer, 1, 400e18), true);
        assertEq(token.hasSufficientBalance(farmer, 1, 500e18), false);
    }

    /*//////////////////////////////////////////////////////////////
                        PERMISSION TESTS
    //////////////////////////////////////////////////////////////*/

    function testSetVerifier() public {
        address newVerifier = address(0x6666);
        token.setVerifier(newVerifier);

        vm.prank(newVerifier);
        token.mint(farmer, 1, 1000e18, "");

        assertEq(token.balanceOf(farmer, 1), 1000e18);
    }

    function testSetLendingPool() public {
        address newPool = address(0x7777);
        token.setLendingPool(newPool);

        vm.prank(verifier);
        token.mint(farmer, 1, 1000e18, "");

        vm.prank(newPool);
        token.lockCollateral(farmer, 1, 500e18);

        assertEq(token.getLockedBalance(farmer, 1), 500e18);
    }

    /*//////////////////////////////////////////////////////////////
                        ERC1155 RECEIVER
    //////////////////////////////////////////////////////////////*/

    function onERC1155Received(address, address, uint256, uint256, bytes memory) public pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4) public pure returns (bool) {
        return true;
    }
}
