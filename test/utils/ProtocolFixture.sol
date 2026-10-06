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

    /// @dev Fixed test prices, so the arithmetic in tests does not move when the demo's prices change.
    function _startingPrices() internal pure override returns (uint128[] memory prices) {
        prices = new uint128[](CommodityDefaults.COUNT);
        prices[0] = 650 * 10 ** 6; // Cocoa $6.50
        prices[1] = 120 * 10 ** 6; // Rice $1.20
        prices[2] = 45 * 10 ** 6; // Maize $0.45
        prices[3] = 320 * 10 ** 6; // Cashew $3.20
        prices[4] = 85 * 10 ** 6; // Yam $0.85
        prices[5] = 40 * 10 ** 6; // Soybeans $0.40
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

    /// @dev `_who` locks `_kg` of a lot and borrows `_amount`, repayable in `_termDays` days.
    function _borrow(address _who, uint256 _lotId, uint256 _kg, uint256 _amount, uint256 _termDays)
        internal
        returns (uint256 loanId)
    {
        vm.startPrank(_who);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        loanId = d.pool.borrow(_lotId, _kg, _amount, uint64(block.timestamp + _termDays * 1 days));
        vm.stopPrank();
    }

    function _seedPool(uint256 _liquidity) internal {
        usdc.mint(investor, _liquidity);
        vm.startPrank(investor);
        usdc.approve(address(d.pool), _liquidity);
        d.pool.deposit(_liquidity);
        vm.stopPrank();
    }
}
