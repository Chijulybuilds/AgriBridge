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
AgriBridge Safe (VERIFIER_ROLE) reviews the live on-chain queue
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
commodity or open a loan. The configured Safe receives verifier and admin roles
on a fresh deployment. For an existing deployment, `make transfer-admin` grants
the Safe those roles and revokes the previous admin/verifier accounts.

## Roles

| Role | Held by | Grants |
|---|---|---|
| `VERIFIER_ROLE` | AgriBridge Safe (`NEXT_PUBLIC_ADMIN_WALLET`) | Approve or reject commodities through Safe transactions |
| `POOL_ROLE` | LendingPool | Update commodity status on collateralisation |
| `MINTER_ROLE` | CommodityRegistry | Mint ERC-1155 collateral |
| `PRICE_UPDATER_ROLE` | Price Oracle owner | Push oracle prices |
| `DEFAULT_ADMIN_ROLE` | AgriBridge Safe (`ADMIN_ADDRESS`) | Wiring, pausing, configuration |

App-level roles (`farmer`, `investor`, `admin`) live in the database and are
separate from on-chain roles. `admin` gates the verifier queue in the UI; the
Safe executes approval or rejection after its configured owners approve the
transaction.

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

## On-chain architecture

The chain is the source of truth for value, collateral, debt, and all application
state. The frontend reads balances, loans, pool statistics and commodity records
directly from the chain through Wagmi, and sends all user-initiated value
transfers straight from the user's own wallet.

### Changes from Backend Version

- **No Backend Server**: The Node.js/Express backend has been removed entirely
- **On-Chain SIWE**: Sign-In with Ethereum implemented client-side with wallet signature verification
- **On-Chain Data**: All commodity data stored on Ethereum (no Supabase mirror)
- **Direct Admin Actions**: Verifier queue access requires wallet with VERIFIER_ROLE
- **USDC Pool**: Investors use `/investor/deposit` to approve USDC, deposit it into
    `LendingPool`, and receive agUSDC shares; the investor dashboard reads pool
    liquidity and utilization from the same deployed pool.
- **No Off-Chain Storage**: All sessions stored in browser localStorage

## Testing strategy

Unit tests cover each contract in isolation, with mocks for its collaborators.
That alone proved insufficient: mocks shaped like the interface a contract
*expects* hid the fact that the real collaborator implemented something else.

`test/integration/` therefore wires the five real contracts together and drives
the whole journey. Fuzz tests in `test/fuzz/` assert properties that must hold
across the input range: deposit round trips are lossless, collateral valuation
is linear, the LTV ceiling holds from both directions, and debt never shrinks
while a loan sits untouched.
