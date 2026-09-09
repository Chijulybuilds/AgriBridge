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
| Backend | Express, TypeScript, Supabase, ethers |
| Frontend | Next.js (Pages Router), Wagmi, RainbowKit, viem |
| Testing | Foundry (unit, fuzz, integration), Playwright (e2e) |
| Network | Sepolia testnet |

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
npm ci --prefix backend  # backend
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
`NEXT_PUBLIC_*` values and into `backend/.env`.

To run entirely locally instead:

```bash
anvil                    # terminal 1
make deploy-local        # terminal 2
```

### 2. Backend

```bash
cd backend
cp .env.example .env     # set JWT_SECRET (openssl rand -hex 32) and the addresses
npm run dev              # http://localhost:4000
```

Apply the database migrations in `backend/supabase/migrations/` to your Supabase
project, in order. For local UI work you can skip Supabase entirely by setting
`USE_MOCK_DB=true`, which serves an in-memory database. That flag is refused
when `NODE_ENV=production`.

### 3. Frontend

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
npm run test:e2e         # Playwright, needs the backend running
npm run test:e2e:ui      # interactive
```

The end-to-end suite injects a mock wallet into the page, so it needs no browser
extension and no private key. Run the backend with `USE_MOCK_DB=true` alongside it.

Contract behaviour is covered by Foundry rather than Playwright. The integration
suite in `test/integration/` wires the real contracts together and drives the
full journey, which is what catches interface drift between them.

## Authentication

Sign-In with Ethereum. The wallet address is the identity; there is no password.

1. The client requests a nonce for its address.
2. The backend stores a one-time nonce and returns a message binding the domain,
   URI, chain id, issue time and expiry.
3. The wallet signs it. Signing is free and creates no transaction.
4. The backend rebuilds the message server-side, recovers the signer, burns the
   nonce, and issues a session JWT.

Users choose farmer or investor at first sign-in. The `admin` role gates the
verifier queue and is granted directly in the database, never self-selected.

## Project layout

```
src/                 Solidity contracts
script/              Foundry deploy scripts
test/                unit, fuzz and integration tests
backend/             Express API, Supabase migrations
pages/               Next.js pages (Pages Router)
components/          shared UI
hooks/               Wagmi contract hooks
lib/                 auth, API client, contract config, generated ABIs
e2e/                 Playwright specs and the mock wallet fixture
scripts/             ABI generation
```

## Environment

Three files, each with a committed template:

| File | Template | Purpose |
|---|---|---|
| `.env` | `.env.example` | Foundry deployment |
| `.env.local` | `.env.example` | Frontend `NEXT_PUBLIC_*` values |
| `backend/.env` | `backend/.env.example` | Backend |

None of the filled-in files are committed. `JWT_SECRET` is required and must be
at least 32 characters; the app refuses to boot without it.
