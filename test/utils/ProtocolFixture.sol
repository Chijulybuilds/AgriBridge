// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityDefaults} from "script/CommodityDefaults.sol";
import {ProtocolDeployer} from "script/ProtocolDeployer.sol";

/// @notice 6-decimal USDC stand-in that anyone can mint.
contract FixtureUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }
}

/**
 * @title ProtocolFixture
 * @notice Deploys the real protocol the way the deploy scripts do: the six commodities and their
 *         prices, one warehouse, and the Safe as the only verifier. The test contract stays admin.
 */
abstract contract ProtocolFixture is Test, ProtocolDeployer {
    /// @dev The AgriBridge verifier Safe; tests act as it with vm.prank.
    address internal constant SAFE = 0xDa152AfD8C2efDA383fde6F840f590C93738de12;

    uint256 internal constant HEARTBEAT = 1 days;
    uint96 internal constant WAREHOUSE_CAPACITY = 10_000_000e18; // 10,000 metric tons
    bytes32 internal constant EVIDENCE = keccak256("signed inspection report");

    uint256 internal constant COCOA = CommodityDefaults.COCOA;
    uint256 internal constant RICE = CommodityDefaults.RICE;
    uint256 internal constant MAIZE = CommodityDefaults.MAIZE;
    uint256 internal constant CASHEW = CommodityDefaults.CASHEW;
    uint256 internal constant YAM = CommodityDefaults.YAM;
    uint256 internal constant SOYBEANS = CommodityDefaults.SOYBEANS;

    Deployment internal d;
    FixtureUSDC internal usdc;
    uint256 internal warehouseId;

    address internal farmer = makeAddr("farmer");
    address internal investor = makeAddr("investor");

    function _deployFixture() internal {
        vm.warp(100 weeks);

        usdc = new FixtureUSDC();
        d = _deployProtocol(address(this), address(usdc), HEARTBEAT);
        _seedCommodities(d);
        warehouseId = d.registry.addWarehouse("Test Warehouse", "Oyo, Nigeria", WAREHOUSE_CAPACITY);
        // Makes the Safe the verifier; the test contract keeps every admin role.
        _handOver(d, address(this), SAFE, address(this));
    }

    /// @dev `_farmer` requests intake and the Safe approves it as measured: the lot's tokens are minted.
    function _verifiedLot(address _farmer, uint256 _commodityId, uint96 _kg, CommodityRegistry.Grade _grade)
        internal
        returns (uint256 lotId)
    {
        vm.prank(_farmer);
        lotId = d.registry.requestIntake(_commodityId, _kg, warehouseId, uint64(block.timestamp - 1 days));

        vm.prank(SAFE);
        d.registry.approveIntake(lotId, _kg, _grade, EVIDENCE);
    }

    function _seedPool(uint256 _liquidity) internal {
        usdc.mint(investor, _liquidity);
        vm.startPrank(investor);
        usdc.approve(address(d.pool), _liquidity);
        d.pool.deposit(_liquidity);
        vm.stopPrank();
    }
}
