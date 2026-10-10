# AgriBridge

> **Crop in a warehouse becomes money a farmer can use.** Farmers borrow against stored crop or sell
> it on a market; investors fund the loans and earn interest. Everything is recorded on-chain, and
> people sign in with MetaMask.

[![Solidity](https://img.shields.io/badge/Solidity-^0.8.24-363636?logo=solidity)](https://soliditylang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-000000?logo=ethereum)](https://book.getfoundry.sh/)
[![Network](https://img.shields.io/badge/Network-Sepolia-8B92B2?logo=ethereum)](https://sepolia.etherscan.io/)
![Status](https://img.shields.io/badge/Status-Testnet%20demo-yellow)

AgriBridge is the team's entry for the STEM Festival brief *"The Agri-Token Exchange"*.

| | |
|---|---|
| **Run it** | [RUN_THE_APP.md](RUN_THE_APP.md): locally, on Sepolia, sign-in setup, tests |
| **Demo it** | [DEMO.md](DEMO.md): the festival story, role by role |
| **How it's built** | [ARCHITECTURE.md](ARCHITECTURE.md): contracts, roles, the app |
| **Why it's safe** | [SECURITY.md](SECURITY.md): each threat, its protection, the test that proves it |

---

## How it works

1. **A farmer delivers crop** to a partner warehouse: cocoa, rice, maize, cashew, yam or soybeans.
2. **The warehouse team weighs and grades it.** Their Safe (a shared multisig wallet, the only
   verifier the contracts accept) approves the delivery. The crop then becomes tokens in the
   farmer's name: one per kilogram, carrying its grade, warehouse and inspection record.
3. **The farmer chooses what to do with it:**
   - **Get an advance:** borrow up to half of what the crop will be worth on the repayment date.
     Repay and the crop comes back.
   - **Sell** on the market, at a fixed price or one that follows the market, with optional
     discounts for bulk buyers.
   - **Collect** it from the warehouse, paying for the storage used.
4. **Investors** put dollars into the lending pool and earn the interest farmers pay. A loss
   cushion, filled by 20% of the interest, absorbs bad debt first.
5. **Crop ages.** Its value falls a little each day, from Grade A to B to C, until it expires.
   Expired stock is bought by AgriBridge at a discount and resold for animal feed.
6. **If an advance's crop falls in value** until the advance is 80% of it, or the advance is 7 days
   late, part of the crop is sold to repay it plus 5%. The rest goes back to the farmer, who keeps
   the money borrowed. Anyone can trigger this; a keeper makes sure it happens.
7. **A regulator** can freeze any lot or warehouse during an investigation.

Every step is a transaction anyone can check on the block explorer.

## What's built

- **Contracts** (`src/`, Solidity 0.8.24, OpenZeppelin 5):
  - crop rules, warehouses and lots
  - crop tokens
  - prices, with safeguards and a Chainlink Functions feeder
  - the lending pool and its keeper
  - the marketplace and the warehouse desk

  260 Foundry tests, plus a Sepolia fork rehearsal.
- **App** (`pages/`, Next.js 16, wagmi 3, viem):
  - screens for farmers, investors, buyers and the regulator
  - a public market
  - a hidden console for the verifier Safe, opened inside Safe{Wallet}

  Sign-in uses MetaMask. Playwright drives the whole demo journey against a local chain.

## Status

- **Testnet only, not audited.** Play money (`DemoUSDC`) in the demo.
- **The festival demo uses prices set by the Safe.** The Chainlink feeder and the local price
  reporters are built and tested, but switched off.
- **Before deploying to Sepolia**, the Safe's owners must replace a leaked owner key; the deploy
  script enforces it. See [RUN_THE_APP.md](RUN_THE_APP.md#3-on-sepolia).

## Project layout

```
src/            contracts (oracle/FunctionsPriceFeeder.sol, demo/DemoUSDC.sol)
script/         deployment: ProtocolDeployer, DeployAll, DeployDemo, CommodityDefaults
test/           unit, fuzz, integration, security, fork
pages/          the app's screens; verifier/ is the Safe's console
components/     layout, shared UI, wallet sign-in, verifier tabs
hooks/          contract reads, transactions, activity
lib/            contract settings, chain client, wallet setups, formatting
e2e/            Playwright tests and the test wallet
scripts/        ABI generation, the Sepolia demo deploy, the Chainlink Functions source
```

## Contributing

Work on a branch and open a pull request into `main`. Before pushing:

```bash
make test
npm run typecheck && npm run lint
npm run test:e2e        # with anvil running and `make deploy-local` done
```

CI runs all of these on every push.

## License

MIT.
