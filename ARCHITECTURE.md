# AgriBridge Architecture

## Flow

```
Farmer connects wallet and signs in (SIWE)
                │
                ▼
Registers a commodity on-chain  ─────────────►  CommodityRegistry
   (type, quantity, grade, harvest date)          status: Pending
                │                                       │
                │  mirrored off-chain for search        │
                ▼                                       │
           Supabase                                     │
                                                        ▼
Verifier (backend wallet, VERIFIER_ROLE) reviews the queue
                │
      ┌─────────┴─────────┐
      ▼                   ▼
  rejectCommodity     approveCommodity
   status: Rejected    status: Verified
                              │
                              ▼
                    CommodityToken mints ERC-1155
                    to the farmer (id = commodity id)
                              │
                              ▼
              Farmer deposits it as collateral
                              │
        CommodityPriceOracle prices the lot
        (per-type price × quantity, 70% max LTV)
                              │
                              ▼
                        LendingPool
                    ┌───────────────┐
                    ▼               ▼
           Farmer borrows      Investors deposit
              USDC               USDC, receive agUSDC
                    └──────► interest ──────┘
```

## Contracts

```
src/
├── CommodityRegistry.sol      Records and lifecycle. Approval mints collateral.
├── CommodityToken.sol         ERC-1155 collateral. Only the registry may mint.
├── CommodityPriceOracle.sol   Prices by commodity type; valuation by commodity id.
├── AgriShareToken.sol         Soulbound agUSDC receipt for pool shares.
└── LendingPool.sol            Deposits, borrowing, interest, liquidation.
```

There is no `CommodityVerifier` contract. Approval and rejection are functions
on `CommodityRegistry`, guarded by `VERIFIER_ROLE`.

### How they connect

`LendingPool` holds immutable references to the registry, the commodity token,
the share token and the oracle. The registry holds mutable addresses for the
token and the pool, set after deployment. `CommodityPriceOracle` holds a
reference to the registry so it can resolve a commodity id to its type.

Deployment order and wiring are handled by `script/DeployAll.s.sol`. The wiring
matters: without `setCommodityTokenAddress`, `setLendingPoolAddress`, and the
`POOL_ROLE` and `VERIFIER_ROLE` grants, the contracts deploy but cannot approve a
commodity or open a loan.

## Roles

| Role | Held by | Grants |
|---|---|---|
| `VERIFIER_ROLE` | Backend service wallet | Approve or reject commodities |
| `POOL_ROLE` | LendingPool | Update commodity status on collateralisation |
| `MINTER_ROLE` | CommodityRegistry | Mint ERC-1155 collateral |
| `PRICE_UPDATER_ROLE` | Backend service wallet | Push oracle prices |
| `DEFAULT_ADMIN_ROLE` | Deployer or `ADMIN_ADDRESS` | Wiring, pausing, configuration |

App-level roles (`farmer`, `investor`, `admin`) live in the database and are
separate from on-chain roles. `admin` gates the verifier queue in the UI; the
on-chain approval is signed by the backend's verifier wallet.

## Decimals

Getting these wrong mis-prices every loan, so they are fixed by contract:

| Quantity | Decimals | Notes |
|---|---|---|
| USDC and agUSDC | 6 | Borrow amounts, deposits, collateral value |
| Commodity quantity | 18 | Kilograms, and the ERC-1155 amount |
| Oracle price | 8 | USD per kilogram |
| Rates and indices | 18 | Interest, health factor, LTV |

`getCollateralValue` converts an 8-decimal price and an 18-decimal quantity into
6-decimal USD, because `LendingPool` compares the result directly against a USDC
borrow amount. 1,000 kg of cocoa at $6.50/kg is `6_500_000_000`.

## Risk parameters

| Parameter | Value |
|---|---|
| Maximum loan-to-value | 70% |
| Liquidation threshold | Health factor 1.0 |
| Liquidation bonus | 5% |
| Base borrow rate | 5% annual |
| Utilisation kink | 80% |
| Reserve factor | 20% of interest |
| Borrow bounds | $100 to $10,000,000 |
| Oracle heartbeat | 24 hours |

A stale price cannot back a loan: collateral valuation reverts once the feed is
older than the heartbeat.

## Off-chain responsibilities

The chain is the source of truth for value, collateral and debt. The backend
covers only what the chain cannot:

- A searchable mirror of commodities, powering the verifier queue.
- Sign-In with Ethereum: nonce issuance, signature verification, session tokens.
- The verifier's approve and reject calls, signed by a wallet holding
  `VERIFIER_ROLE`.
- Verification reports, which hold inspection detail too large for on-chain storage.

The frontend reads balances, loans, pool statistics and commodity records
directly from the chain through Wagmi, and sends all user-initiated value
transfers straight from the user's own wallet.

## Testing strategy

Unit tests cover each contract in isolation, with mocks for its collaborators.
That alone proved insufficient: mocks shaped like the interface a contract
*expects* hid the fact that the real collaborator implemented something else.

`test/integration/` therefore wires the five real contracts together and drives
the whole journey. Fuzz tests in `test/fuzz/` assert properties that must hold
across the input range: deposit round trips are lossless, collateral valuation
is linear, the LTV ceiling holds from both directions, and debt never shrinks
while a loan sits untouched.
