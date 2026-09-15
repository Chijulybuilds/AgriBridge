# AgriBridge

Tokenize agricultural commodities, then borrow stablecoins against them.

A farmer registers a harvest on-chain. A verifier inspects and approves it,
which mints an ERC-1155 token representing that specific lot. The farmer
deposits the token as collateral in a lending pool and borrows USDC supplied by
investors, who earn the interest.

```
Farmer registers commodity  ──►  Verifier approves  ──►  ERC-1155 minted
                                                              │
                                                              ▼
      Investors supply USDC  ──►  Lending Pool  ◄──  Collateral deposited
                                       │
                                       ▼
                            Farmer borrows USDC
```

## Stack

| Layer | Technology |
|---|---|
| Contracts | Solidity 0.8.24, Foundry, OpenZeppelin |
| Frontend | Next.js (Pages Router), Wagmi, RainbowKit, viem |
| Testing | Foundry (unit, fuzz, integration), Playwright (e2e) |
| Network | Sepolia testnet |

**Note:** The backend has been removed. The app is now a pure dApp with:
- All commodity data stored on-chain
- On-chain SIWE authentication (wallet signature verification)
- Direct verifier actions signed by admin wallet (no backend proxy)

## Contracts

| Contract | Role |
|---|---|
| `CommodityRegistry` | Commodity records and their lifecycle. Verifiers approve or reject here, which triggers minting. |
| `CommodityToken` | ERC-1155 collateral. Token id equals commodity id. Only the registry can mint. |
| `CommodityPriceOracle` | Prices per commodity type, and collateral valuation by commodity id. |
| `AgriShareToken` | Soulbound agUSDC receipt for pool deposits. |
| `LendingPool` | USDC deposits, collateralised borrowing, interest accrual, liquidation. |

Loans are capped at 70% loan-to-value. Interest follows a kink-based model that
rises steeply past 80% utilisation so liquidity remains available for
withdrawals.

## Getting started

Prerequisites: Node 20+, Foundry, and Git.

```bash
git clone --recurse-submodules https://github.com/Chijulybuilds/AgriBridge.git
cd AgriBridge
make dependency          # Foundry libraries
npm install              # frontend
```

### 1. Contracts

```bash
forge build
make test                # unit, fuzz and integration suites, all local
```

Deploy. `DeployAll` is the supported path: it deploys all five contracts,
performs every cross-contract wiring step, and seeds initial prices.

```bash
cp .env.example .env     # fill in SEPOLIA_URL, PRIVATE_KEY, USDC_CONTRACT_ADDRESS, VERIFIER_ADDRESS
make deploy-all          # or: make verify, to also verify on Etherscan
```

The script prints every deployed address. Copy them into `.env.local` as the
`NEXT_PUBLIC_*` values.

To run entirely locally instead:

```bash
anvil                    # terminal 1
make deploy-local        # terminal 2
```

### 2. Frontend

```bash
npm run abis             # generate ABIs from Foundry artifacts
cp .env.example .env.local
npm run dev              # http://localhost:3000
```

 Investors need testnet USDC. Claim it from [faucet.circle.com](https://faucet.circle.com)
and import the token into your wallet.

## Testing

```bash
make test                # Foundry: unit, fuzz, integration
forge coverage
npm run test:e2e         # Playwright
npm run test:e2e:ui      # interactive
```

The end-to-end suite injects a mock wallet into the page, so it needs no browser
extension and no private key.

Contract behaviour is covered by Foundry rather than Playwright. The integration
suite in `test/integration/` wires the real contracts together and drives the
full journey, which is what catches interface drift between them.

## Authentication

Sign-In with Ethereum. The wallet address is the identity; there is no password.

1. The client constructs a SIWE message with a nonce and other metadata.
2. The wallet signs it. Signing is free and creates no transaction.
3. The frontend stores the signature and creates a local session.
4. Role assignment is determined on-chain by checking the admin wallet address.

Users choose farmer or investor at first sign-in. The `admin` role gates the
verifier queue and is granted to wallets configured as `NEXT_PUBLIC_ADMIN_WALLET`.

## Project layout

```
src/                 Solidity contracts
script/              Foundry deploy scripts
test/                unit, fuzz and integration tests
pages/               Next.js pages (Pages Router)
components/          shared UI
hooks/               Wagmi contract hooks
lib/                 auth, contract config, generated ABIs
e2e/                 Playwright specs and the mock wallet fixture
scripts/             ABI generation
```

## Environment

Two files, each with a committed template:

| File | Template | Purpose |
|---|---|---|
| `.env` | `.env.example` | Foundry deployment |
| `.env.local` | `.env.example` | Frontend `NEXT_PUBLIC_*` values |

None of the filled-in files are committed. `NEXT_PUBLIC_ADMIN_WALLET` is
required for admin functionality.

## Key Changes from Backend Version

1. **No Backend Server**: Removed the Node.js/Express backend entirely
2. **On-Chain Data**: All commodity data stored on Ethereum
3. **SIWE On-Chain**: Client-side SIWE message construction and signature verification
4. **Admin Wallet**: Verifier actions signed directly by admin wallet (requires VERIFIER_ROLE)
5. **No Supabase**: All session and profile data stored in browser localStorage
6. **Direct Contract Calls**: All writes go directly from user's wallet

## Admin Functionality

The admin wallet has access to the verification queue at `/admin/queue`. To
set up admin access:

1. Get the address of the wallet that should have admin privileges
2. Ensure that wallet has `VERIFIER_ROLE` on the `CommodityRegistry` contract
3. Set `NEXT_PUBLIC_ADMIN_WALLET=<wallet_address>` in `.env.local`
4. When signing in with that wallet, admin features will be enabled

---

**Happy farming! 🌾**
