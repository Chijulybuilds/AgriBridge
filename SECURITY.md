# AgriBridge security

How the protocol defends against the threats the STEM Festival brief names, where each defence
lives in the code, and which test proves it. Status: **testnet prototype, not audited.**

Run every test with `forge test`; the attack suite alone with `forge test --match-path test/security/*`.

---

## Threats named in the brief

### 1. Reentrancy

A contract re-enters the pool, the marketplace or the desk while it is half-way through moving funds.

| Defence | Where |
|---|---|
| `nonReentrant` on every function that moves USDC or tokens | `LendingPool`, `Marketplace`, `WarehouseDesk` |
| State is updated before tokens leave; repayment takes the USDC before returning collateral | `LendingPool.repay`, `Marketplace.buy` |

**Proof:** `test/security/PoolAttacks.t.sol` → `test_Reentrancy_OnCollateralReturnIsBlocked`. A borrower
contract tries to withdraw from the pool while its collateral is being returned, and the whole
repayment reverts.

### 2. Flash-loan exploits

A flash loan gives an attacker a huge amount of capital for the length of one transaction. It is
dangerous wherever capital can move a price or a share value. Here:

| Vector | Defence | Proof |
|---|---|---|
| Push a market price to trigger liquidations | No price comes from an on-chain market. World prices come from Chainlink Functions (median of several providers); local prices from a 2-of-3 reporter quorum. Loans never read marketplace prices. | `PoolAttacks.t.sol` → `test_OracleJump_CannotLiquidateOnItsOwn` |
| Inflate the share price by sending USDC straight to the pool | The pool keeps its own `cash` books, so donations are ignored | `test_Donation_DoesNotMoveTheSharePrice` |
| First-deposit inflation (dust deposit + donation) | Internal accounting plus virtual shares | `test_FirstDepositInflation_Fails` |
| Deposit and withdraw within one transaction | Withdrawing in the same block as a deposit is refused | `test_SameBlockDepositAndWithdraw_Reverts` |
| Deposit just before a large repayment and leave after it (sandwich) | Interest counts as it accrues (scaled debt), so a repayment does not move the share price | `test_RepaymentSandwich_EarnsNothing`; fuzz `testFuzz_DepositNeverMovesTheSharePrice` |
| Borrow collateral for one transaction | Commodity tokens exist only for produce the verifier Safe has weighed and graded | `CommodityTokenTest` → `test_Mint_Revert_NotMinter` |

### 3. Oracle manipulation

| Defence | Where | Proof |
|---|---|---|
| Decentralized sources: Chainlink Functions takes the median of several providers and needs at least 2 | `src/oracle/FunctionsPriceFeeder.sol`, `scripts/functions/commodity-prices.js` | `FunctionsPriceFeederTest` |
| Local prices count only when 2 of the 3 approved reporters agree within 5% | `CommodityPriceOracle.submitLocalPrice` | `test_Local_OutlierIsOutvoted`, `test_Local_DisagreeingReportsChangeNothing` |
| **Move cap:** a move over 10% is held until a later update (at least 10 minutes on) agrees | `CommodityPriceOracle._propose` | `test_MoveCap_LargeMoveIsHeld`, `test_MoveCap_GlitchIsDroppedWhenTheNextUpdateIsNormal` |
| Bounds and a staleness limit per commodity; a stale price blocks borrowing and liquidation | `getPriceFresh`, `setHeartbeat` | `test_GetPriceFresh_RevertsOnceStale`, `test_Borrow_Revert_StalePrice` |
| **Circuit breaker:** pausing the oracle stops every valuation | `getPriceFresh` is `whenNotPaused` | `test_Pause_IsTheCircuitBreaker`, `test_OracleBreaker_StopsLiquidations` |
| Only the Safe can set a price directly, e.g. to correct a feed | `forcePrice` (admin only) | `test_ForcePrice_Revert_NotAdmin` |

---

## Other protections

| Risk | Defence | Proof |
|---|---|---|
| Tokens without produce behind them | Only the verifier mints, through intake; **VERIFIER_ROLE can have exactly one holder**, the AgriBridge Safe; the inspection report's hash is stored with each lot; warehouse capacity is enforced | `CommodityRegistryTest`: `test_ApproveIntake_Revert_AnyoneButTheSafe`, `test_Verifier_CannotAddASecond`, `test_ApproveIntake_Revert_OverCapacity` |
| Tokens drifting from stored stock | Tokens burn only when the Safe confirms goods left the warehouse | `WarehouseDeskTest` → `testFuzz_TokensMatchStoredStock` |
| A suspect lot or warehouse | The regulator freezes it: no loans, listings, withdrawals or user-to-user transfers; protocol contracts can still return tokens to their owners | `test_Transfer_Revert_FrozenLotBetweenUsers`, `test_RepayReturnsCollateralOfAFrozenLot`, `test_Liquidate_Revert_FrozenLot` |
| Liquidating only once a loan is underwater | Liquidation at 80% LTV leaves a 20% buffer; a liquidator takes debt + 5% and the rest returns to the borrower; bad debt hits reserves before investors | `LendingPoolLiquidationTest` (worked example, bad debt), fuzz `testFuzz_LiquidationTakesAtMostDebtPlusBonus` |
| Nobody liquidates | The Automation keeper liquidates with reserves | `test_Keeper_FindsAndLiquidatesDueLoans`, `test_OverdueLoanIsLiquidatedByTheKeeper` |
| A keeper run sent with too little gas, so liquidations fail and are logged as skipped | Each attempt needs `GAS_PER_LIQUIDATION` left or the whole run reverts, so a gas estimate always covers the liquidation | `test_Keeper_RevertsWithoutEnoughGasInsteadOfSkipping` |
| Investors draining protocol reserves | Reserves never back withdrawals or loans | `test_InvestorsCannotWithdrawReserves` |
| Admin key compromise | Every admin role sits with the Safe; the deployer renounces everything at the end of deployment; the demo script refuses leaked keys, and refuses a Safe that lists one as owner | `DemoDeploymentTest` → `test_DeployerKeepsNoRoles`, `test_SafeIsTheOnlyVerifierAndTheAdmin` |

---

## Known limitations (before any real money)

- **Not audited.** Testnet prototype only.
- **The verifier Safe's owners:** one owner, `0xb7d9…4f99`, is a key that is public in this repo's git
  history. Swap it out before the Safe is used on any deployment; `npm run demo:sepolia` refuses to
  deploy until then.
- **No live prices in the festival demo.** Prices are set at deployment and only the Safe can change
  them. The Chainlink Functions feeder and the reporter quorum are built and tested but switched
  off; their price providers are not chosen yet (`scripts/functions/commodity-prices.js`).
- **No timelock** on admin actions; planned for a pilot.
- **Physical risk** (loss, theft, mis-grading) is handled off-chain by the warehouse operator,
  insurance and audits. The contracts can freeze stock and record evidence, but cannot see the
  warehouse.
- **No upgrades:** contracts are immutable, so a fix means redeploying and migrating.

## Reporting a vulnerability

Email the maintainers privately; please do not open a public issue.
