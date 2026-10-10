# AgriBridge architecture

AgriBridge turns crop held in partner warehouses into tokens that can be borrowed against or sold.
This page explains how the contracts fit together, who may do what, and how the app is built.
For the threats and the tests that cover them, see [SECURITY.md](SECURITY.md).

## The flow

```
Farmer books a delivery ──► CommodityRegistry (lot: Pending)
                                     │
                 Verifier Safe weighs, grades, attaches report fingerprint
                                     │ approveIntake
                                     ▼
              CommodityToken mints 1 token per kg to the farmer (token id = lot id)
                                     │
       ┌──────────────────┬──────────┴────────┬───────────────────────┐
       ▼                  ▼                   ▼                       ▼
  LendingPool         Marketplace        WarehouseDesk          (holds and ages)
  borrow against it   list / buy         collect: pickup or     value falls daily:
  repay → crop back   bulk deals         delivery, storage fee; A → B → C → expired
  liquidation         clearance of       Safe confirms, tokens
  (anyone, or keeper) expired stock      are burned
       ▲
  Investors deposit USDC, receive AgriShare shares, earn interest
```

Every value the protocol uses comes from one formula:

```
value = oracle price (USD/kg) × kilograms × decay factor × (1 − basis cut)
```

- **Decay** follows each crop's schedule. Value slides daily from Grade A to the Grade B level, then
  to the Grade C level, then holds until the lot expires.
- **The basis cut** lowers a world price to a local warehouse value. It is 0 for locally priced crops.

## Contracts

| Contract | What it does |
|---|---|
| `CommodityConfig` | One row of rules per crop: grade values, days to each grade and to expiry, borrow limit, settlement point, basis cut, storage fee, price source, open or closed. |
| `CommodityRegistry` | Warehouses (capacity, region, open, frozen) and lots. Deliveries are booked by farmers and approved or rejected by the one verifier. Lots carry the measured weight, grade, warehouse and report fingerprint. Also the decay maths and the regulator's freezes. |
| `CommodityToken` | ERC-1155, one token per kilogram, token id = lot id. Only the registry mints and only the warehouse desk burns. Frozen lots can't move, except back from the protocol. Metadata is on-chain. |
| `CommodityPriceOracle` | USD/kg per crop. Staleness limit per crop; a 10% move cap that holds a bigger jump until a later update agrees; pause as a circuit breaker; the Safe's override; and for local crops, a price only when 2 of the approved reporters agree. |
| `FunctionsPriceFeeder` | Chainlink Functions: the median of several price APIs for the world-priced crops. Built and tested; switched off for the festival demo. |
| `LendingPool` | Investors' USDC and AgriShare shares, plus the advances. A borrow is limited by the crop's value at its end date. Interest accrues every second (80% to investors, 20% to the loss cushion). A loan is liquidated at 80% of the crop's value or 7 days overdue: the debt plus 5% is taken and the rest returned. Bad debt hits the cushion first. |
| `LiquidationKeeper` | Chainlink Automation upkeep, also callable by anyone, that settles due loans from the cushion. |
| `Marketplace` | Listings at a fixed price or at a share of today's value, with optional bulk deals and partial buys protected by a price limit. A 1% fee. Clearance: expired stock sold to the protocol 30% below value and relisted for feed buyers. |
| `WarehouseDesk` | Collecting goods: pickup, or delivery within a budget. Storage is charged pro rata by the day, and the Safe confirms the goods left. |
| `AgriShareToken` | Non-transferable receipt for pool shares. |
| `DemoUSDC` | Play-money USDC with a faucet, for demo deployments only. |

Deployment lives in `script/ProtocolDeployer.sol`, shared by `DeployAll` (real USDC) and `DeployDemo`
(play money, two warehouses, a seeded pool). It wires the contracts, seeds the six crops and their
prices, hands every role to the Safe, and audits the result: the deployer must keep nothing.

## Who may do what

| Who | Role(s) | Can |
|---|---|---|
| Verifier Safe `0xDa15…de12` | admin of every contract, `VERIFIER_ROLE` (one holder, enforced by the registry), `CUSTODIAN_ROLE`, `CLEARANCE_ROLE` | approve or reject deliveries; confirm collections; set prices; edit crops and warehouses; run clearance; grant the regulator and reporters; pause |
| Regulator | `REGULATOR_ROLE` | freeze or unfreeze lots and warehouses |
| Reporters | `isReporter` on the oracle | post local prices (two must agree) |
| Keeper | `KEEPER_ROLE` on the pool | settle due loans from the cushion |
| Anyone | none | deliver, borrow, repay, invest, list, buy, collect, liquidate due loans for the 5% bonus |

## The app

Next.js (Pages Router), wagmi v3 and viem. There is no backend: everything is read from and written
to the chain.

```
pages/
  index, login                    landing page with live figures; sign-in
  farmer/  index, deliver, advance, loans
  stock/   index (My stock), collect
  investor/ index, risk
  market/  index (public), sell, clearance
  regulator, activity
  verifier/index                  the Safe's console: hidden, Safe-only, its own wallet setup
components/  layout, ui, lots, market, wallet, verifier/*
hooks/       useProtocolData (reads), useTx (writes), useActivity (events)
lib/         contracts/config, chain (read client), wagmi (wallet setups), format, session
```

- **Two wallet setups.** The public app signs people in with MetaMask only (the end-to-end tests
  use their own test wallet). `/verifier` uses its own setup that connects only to the Safe, as a
  Safe App inside Safe{Wallet}. See `components/providers.tsx`.
- **Reads** go through one viem client (`lib/chain.ts`), not the wallet, so they work signed out
  and in both setups. Concurrent reads are grouped into one Multicall3 call where the chain has it.
- **Writes** go through `useTx`. It asks for an approval only when one is missing, waits for the
  receipt, then refreshes every screen. Inside Safe{Wallet} it reports "sent to the Safe" instead
  of waiting.
- **Plain words.** The screens show dollars and kilograms, grades and dates. Contract errors map to
  sentences in `hooks/useTx.ts`, and every action links to its record on the block explorer.

## Tests

- **Contracts:** 260 Foundry tests: unit, fuzz, integration, attack scenarios, and the handover
  audit. `test/fork/SepoliaRehearsal.t.sol` plays the whole story on a Sepolia fork as the real Safe.
- **App:** Playwright drives the real app with a test wallet that sends real transactions to a
  local chain. It covers sign-in, the hidden verifier page, and the full demo journey (`e2e/`).
