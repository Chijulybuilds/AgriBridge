// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/LiquidityShareToken.sol";

/**
 * @title LiquidityShareTokenTest
 * @author AgriDeFi Protocol Team
 * @notice Unit tests for LiquidityShareToken (agUSDC) contract
 */
contract LiquidityShareTokenTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE
    //////////////////////////////////////////////////////////////*/

    LiquidityShareToken public shareToken;
    address public lendingPool = address(0x1111);
    address public investor = address(0x2222);
    address public owner;

    /*//////////////////////////////////////////////////////////////
                            SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        owner = address(this);
        shareToken = new LiquidityShareToken(lendingPool);
    }

    /*//////////////////////////////////////////////////////////////
                        MINTING TESTS
    //////////////////////////////////////////////////////////////*/

    function testMintShares() public {
        vm.prank(lendingPool);
        shareToken.mint(investor, 1000e6); // 1000 agUSDC

        assertEq(shareToken.balanceOf(investor), 1000e6);
        assertEq(shareToken.totalSupply(), 1000e6);
    }

    function testOnlyLendingPoolCanMint() public {
        address unauthorized = address(0x3333);

        vm.prank(unauthorized);
        vm.expectRevert(LiquidityShareToken.OnlyLendingPoolCanMint.selector);
        shareToken.mint(investor, 1000e6);
    }

    function testMintInvalidAmount() public {
        vm.prank(lendingPool);
        vm.expectRevert(LiquidityShareToken.InvalidAmount.selector);
        shareToken.mint(investor, 0);
    }

    /*//////////////////////////////////////////////////////////////
                        BURNING TESTS
    //////////////////////////////////////////////////////////////*/

    function testBurnShares() public {
        vm.prank(lendingPool);
        shareToken.mint(investor, 1000e6);

        vm.prank(lendingPool);
        shareToken.burn(investor, 500e6);

        assertEq(shareToken.balanceOf(investor), 500e6);
        assertEq(shareToken.totalSupply(), 500e6);
    }

    function testOnlyLendingPoolCanBurn() public {
        vm.prank(lendingPool);
        shareToken.mint(investor, 1000e6);

        address unauthorized = address(0x3333);
        vm.prank(unauthorized);
        vm.expectRevert(LiquidityShareToken.OnlyLendingPoolCanBurn.selector);
        shareToken.burn(investor, 500e6);
    }

    function testBurnInsufficientBalance() public {
        vm.prank(lendingPool);
        shareToken.mint(investor, 1000e6);

        vm.prank(lendingPool);
        vm.expectRevert(LiquidityShareToken.InsufficientBalance.selector);
        shareToken.burn(investor, 2000e6);
    }

    /*//////////////////////////////////////////////////////////////
                        TRANSFER TESTS
    //////////////////////////////////////////////////////////////*/

    function testTransferShares() public {
        vm.prank(lendingPool);
        shareToken.mint(investor, 1000e6);

        address recipient = address(0x4444);

        vm.prank(investor);
        shareToken.transfer(recipient, 500e6);

        assertEq(shareToken.balanceOf(investor), 500e6);
        assertEq(shareToken.balanceOf(recipient), 500e6);
    }

    function testApproveAndTransferFrom() public {
        vm.prank(lendingPool);
        shareToken.mint(investor, 1000e6);

        address spender = address(0x4444);
        address recipient = address(0x5555);

        vm.prank(investor);
        shareToken.approve(spender, 500e6);

        vm.prank(spender);
        shareToken.transferFrom(investor, recipient, 500e6);

        assertEq(shareToken.balanceOf(investor), 500e6);
        assertEq(shareToken.balanceOf(recipient), 500e6);
    }

    /*//////////////////////////////////////////////////////////////
                        DECIMALS TEST
    //////////////////////////////////////////////////////////////*/

    function testDecimals() public view {
        assertEq(shareToken.decimals(), 6);
    }

    /*//////////////////////////////////////////////////////////////
                        METADATA TESTS
    //////////////////////////////////////////////////////////////*/

    function testName() public view {
        assertEq(shareToken.name(), "AgriDeFi USDC Share Token");
    }

    function testSymbol() public view {
        assertEq(shareToken.symbol(), "agUSDC");
    }

    /*//////////////////////////////////////////////////////////////
                        PERMISSION TESTS
    //////////////////////////////////////////////////////////////*/

    function testSetLendingPool() public {
        address newPool = address(0x6666);
        shareToken.setLendingPool(newPool);

        vm.prank(newPool);
        shareToken.mint(investor, 1000e6);

        assertEq(shareToken.balanceOf(investor), 1000e6);
    }

    function testSetLendingPoolInvalidAddress() public {
        vm.expectRevert(LiquidityShareToken.InvalidAddress.selector);
        shareToken.setLendingPool(address(0));
    }
}
