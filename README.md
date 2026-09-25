# AgriBridge

> **Decentralized Agricultural Finance — Tokenize commodities, borrow stablecoins, earn yield.**

[![Solidity](https://img.shields.io/badge/Solidity-^0.8.24-363636?logo=solidity)](https://soliditylang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-000000?logo=ethereum)](https://book.getfoundry.sh/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Network](https://img.shields.io/badge/Network-Sepolia-8B92B2?logo=ethereum)](https://sepolia.etherscan.io/)
![Status](https://img.shields.io/badge/Status-Development-yellow)

---

## 📋 Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Smart Contracts](#smart-contracts)
- [Frontend](#frontend)
- [Security Model](#security-model)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development (Anvil)](#1-local-development-anvil)
  - [Sepolia Testnet](#2-sepolia-testnet)
  - [Frontend Setup](#3-frontend-setup)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Deployment](#deployment)
- [Theming](#theming)
- [Project Layout](#project-layout)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Overview

AgriBridge connects **farmers** with verified agricultural commodities to **investors** seeking transparent, asset-backed yields — entirely on-chain.

A farmer registers a harvest (e.g., 10,000 kg of Grade-A Cocoa). A verifier inspects and approves it on-chain, minting an **ERC-1155 token** that represents that specific lot. The farmer deposits the token as collateral in a lending pool and borrows **USDC** supplied by investors. Investors earn interest proportional to pool utilisation.

The entire system runs without a backend server — it is a **pure dApp**. Wallet signatures replace passwords, on-chain data replaces databases, and smart contracts replace business logic.

```
  ┌─────────────┐     ┌──────────────┐     ┌───────────────┐
  │ 1. Register │────▶│ 2. Verify    │────▶│ 3. Mint Token │
  │  (Farmer)   │     │  (Verifier)  │     │  (ERC-1155)   │
  └─────────────┘     └──────────────┘     └───────┬───────┘
                                                    │
                                                    ▼
  ┌─────────────┐     ┌──────────────┐     ┌───────────────┐
  │ 6. Earn     │◀────│ 5. Lending   │◀────│ 4. Deposit    │
  │  Returns    │     │  Pool        │     │  Collateral   │
  │  (Investor) │     │              │     │  (Farmer)     │
  └─────────────┘     └──────┬───────┘     └───────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Farmer borrows  │
                    │ USDC from pool  │
                    └─────────────────┘
```

---

## How It Works

### For Farmers 👨‍🌾

| Step | Action | On-Chain? |
|------|--------|-----------|
| 1 | Register a commodity harvest (type, quantity, grade, harvest date) | ✅ Transaction |
| 2 | Wait for verifier to inspect and approve | — |
| 3 | Approved commodity becomes an ERC-1155 collateral token | ✅ Automatic |
| 4 | Deposit the token into the Lending Pool as collateral | ✅ Transaction |
| 5 | Borrow USDC up to 70% of the collateral's oracle value | ✅ Transaction |
| 6 | Repay principal + interest to unlock collateral | ✅ Transaction |

### For Investors 📈

| Step | Action | On-Chain? |
|------|--------|-----------|
| 1 | Connect wallet and browse liquidity pools | — |
| 2 | Deposit USDC into the Lending Pool | ✅ Transaction |
| 3 | Receive agUSDC (soulbound receipt token) that accrues value | ✅ Automatic |
| 4 | Track returns on the dashboard (APY updates with utilisation) | — |
| 5 | Withdraw USDC plus accrued interest anytime | ✅ Transaction |

### For Verifiers/Admins 🛡️

| Step | Action | On-Chain? |
|------|--------|-----------|
| 1 | Access `/admin/queue` (admin wallet only) | — |
| 2 | Review pending commodity submissions | — |
| 3 | Approve (triggers ERC-1155 mint) or reject (records reason) | ✅ Transaction |

---

## Architecture

### Layer Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js)                      │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐  │
│  │  Pages   │  │  Hooks   │  │  Auth  │  │  Theme    │  │
│  │ (Router) │  │ (Wagmi)  │  │ (SIWE) │  │ (Toggle)  │  │
│  └──────────┘  └──────────┘  └────────┘  └───────────┘  │
│                     │                                        │
│            ┌────────┴────────┐                               │
│            │  RainbowKit +   │                               │
│            │  Wagmi / viem   │                               │
│            └────────┬────────┘                               │
├─────────────────────┼────────────────────────────────────────┤
│           Blockchain (EVM - Sepolia / Anvil)                  │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────┐  │
│  │Commodity │ │Commodity │ │ Price  │ │ Lending│ │Agri  │  │
│  │Registry  │ │ Token    │ │ Oracle │ │ Pool   │ │Share │  │
│  │          │ │(ERC-1155)│ │        │ │        │ │Token │  │
│  └──────────┘ └──────────┘ └────────┘ └────────┘ └──────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **No Backend Server**: Removing the Node.js/Express backend eliminates a central point of failure, reduces infrastructure costs, and strengthens trust — every action is a signed transaction.
- **Static Export Compatible**: Every page reads chain data through Wagmi in the browser. No server-side data fetching means the app can be deployed to IPFS and static hosts.
- **SIWE Authentication**: Sign-In with Ethereum replaces passwords. Wallet address = identity. No email, no database.
- **Oracle-Backed Collateral**: The `CommodityPriceOracle` contract provides USD prices per commodity type, so loan-to-value ratios are computed on-chain in real-time.

---

## Smart Contracts

### Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| CommodityRegistry | `0xfa9E23C429C985241ecA989884e45252c46eD844` |
| CommodityToken (ERC-1155) | `0xF3ea544b60C298b774F294b631765C6fc1c8F8dd` |
| CommodityPriceOracle | `0xEa4E9a31FC6D18Ac9b0b0949aDE1481762757569` |
| AgriShareToken | `0x3A3D0260e6fd2411F1E11087dcA911904c4E27aE` |
| LendingPool | `0xe1315c99056772dB75a9D5A03C6BC269f8ea903a` |
| USDC (Sepolia) | `0x6d4bb60203535853ffd8352956dff549c4ba052f` |

### Contract Details

#### CommodityRegistry
Manages the full lifecycle of commodity records on-chain.

| Function | Description |
|----------|-------------|
| `registerCommodity(type, quantity, grade, harvestDate, storageDays)` | Farmer registers a new commodity lot |
| `approveCommodity(id)` | Verifier approves → mints ERC-1155 token |
| `rejectCommodity(id, reason)` | Verifier rejects with on-chain reason |
| `getCommodity(id)` | Returns full commodity struct (farmer, status, type, grade, quantity, dates) |
| `getFarmerCommodityIds(farmer)` | Lists all commodity IDs owned by a farmer |
| `commodityCount()` | Total commodities registered |

**Commodity Statuses:** `Pending → Verified → Rejected → Collateralized → Released → Liquidated → Expired`

#### CommodityToken (ERC-1155)
The collateral asset. Each token ID maps 1:1 to a commodity ID in the Registry.

- **Only the Registry** can mint new tokens (via `approveCommodity`)
- **Soulbound-like**: Transfers are restricted to the Lending Pool (collateral deposits)
- **Metadata**: URI template set at deploy time (`TOKEN_METADATA_BASE_URI`)

#### CommodityPriceOracle
USD price feeds per commodity type, used for collateral valuation.

| Function | Description |
|----------|-------------|
| `setPrice(commodityType, price)` | Admin sets the USD price per kg |
| `getPrice(commodityType)` | Returns the current price |
| `getCollateralValue(commodityId, quantity)` | Returns USD value at current oracle price |

#### LendingPool
The core lending engine. Manages deposits, borrowing, interest, and liquidations.

| Function | Description |
|----------|-------------|
| `deposit(amount)` | Investor supplies USDC, receives agUSDC shares |
| `withdraw(shares)` | Redeems agUSDC for underlying USDC + interest |
| `borrow(commodityId, collateralAmount, borrowAmount)` | Farmer borrows against deposited collateral |
| `repay(loanId, amount)` | Farmer repays principal + interest |
| `getLoanDetails(id)` | Returns loan struct (farmer, principal, collateral, status, totalDebt) |
| `getHealthFactor(id)` | Returns loan health (collateral value / debt) |
| `totalAssets()` | Total USDC under management |
| `totalBorrowed()` | Total USDC currently borrowed |
| `getBorrowRate()` | Current annualised borrow rate (influenced by utilisation) |

**Loan Parameters:**
- **Max LTV:** 70% (loan-to-value)
- **Interest Model:** Kink-based — rate rises steeply past 80% utilisation
- **Liquidation:** Triggers when health factor < 1.0

#### AgriShareToken (agUSDC)
Soulbound receipt token for pool deposits.

- **Non-transferable**: Cannot be traded or transferred between wallets
- **Value-accruing**: agUSDC's underlying value grows as interest accrues in the pool
- **Decimal-compatible**: Mirrors USDC's 6 decimals

---

## Frontend

### Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 16** (Pages Router) | Framework with static export support |
| **Wagmi** v2 | React hooks for Ethereum (accounts, contracts, reads/writes) |
| **RainbowKit** v2 | Wallet connection UI (supports MetaMask, WalletConnect, and 300+ wallets) |
| **viem** v2 | Low-level TypeScript interface for Ethereum |
| **TanStack React Query** v5 | Caching and refetching for blockchain reads |
| **Tailwind CSS** v4 | Utility-first CSS (via PostCSS) |
| **@heroicons/react** | SVG icon library |
| **Playwright** | End-to-end testing |

### Pages

| Route | Access | Description |
|-------|--------|-------------|
| `/` | Public | Landing page with hero, features, stats, and how-it-works |
| `/login` | Public | SIWE authentication with wallet connection |
| `/farmer/dashboard` | Farmer | Overview: commodity count, debt, pending verifications |
| `/farmer/commodities` | Farmer | Full list of registered commodities |
| `/farmer/tokenize` | Farmer | Register a new commodity on-chain |
| `/farmer/borrow` | Farmer | Deposit collateral and borrow USDC |
| `/farmer/loans` | Farmer | Active and historical loans |
| `/investor/dashboard` | Investor | Overview: deposits, earnings, APY, available liquidity |
| `/investor/pools` | Investor | Browse liquidity pools and their metrics |
| `/investor/deposit` | Investor | Deposit USDC into the lending pool |
| `/investor/returns` | Investor | Track earnings and withdrawal options |
| `/admin/dashboard` | Admin | Queue overview and verification statistics |
| `/admin/queue` | Admin | Full verification queue with approve/reject modal |

### Key Hooks (`hooks/useProtocol.ts`)

| Hook | Description |
|------|-------------|
| `usePoolStats()` | Live pool metrics: TVL, borrow rate, utilisation, supply APY |
| `useInvestorPosition()` | Investor's agUSDC balance, position value, earnings, USDC allowance |
| `useMyCommodities()` | Farmer's registered commodities with on-chain status |
| `useRegisterCommodity()` | Write hook to register a new commodity |
| `useCollateralValue(commodityId, quantity)` | Oracle-backed USD value of collateral |
| `useMyLoans()` | Farmer's loans with live debt and health factor |
| `useBorrow()` | Write hooks for approve collateral, borrow, repay, approve USDC |
| `useDeposit()` | Write hooks for approve USDC, deposit, withdraw |
| `useTx()` | Generic transaction wrapper with lifecycle status |

### Auth Flow (`lib/auth.ts`)

1. User clicks "Sign in with Ethereum"
2. A SIWE (EIP-4361) message is constructed client-side:
   ```
   agribridge.local wants you to sign in with your Ethereum account:
   0x...
   
   URI: http://localhost:3000
   Version: 1
   Chain ID: 11155111
   Nonce: <timestamp>
   Role: farmer
   ```
3. Wallet signs the message (free — no gas, no transaction)
4. Signature and profile are stored in `localStorage`
5. Role detection: if wallet matches `NEXT_PUBLIC_ADMIN_WALLET`, role is set to `admin`

---

## Security Model

### Access Control

| Role | Permissions | On-Chain |
|------|-------------|----------|
| **Farmer** | Register commodities, deposit collateral, borrow, repay | `CommodityRegistry.registerCommodity`, `LendingPool.borrow/repay` |
| **Verifier** | Approve/reject commodities (triggers ERC-1155 mint) | `CommodityRegistry.approveCommodity/rejectCommodity` (requires `VERIFIER_ROLE`) |
| **Investor** | Deposit/withdraw USDC from pools | `LendingPool.deposit/withdraw` |
| **Admin** | Set oracle prices, manage roles | `CommodityPriceOracle.setPrice`, OpenZeppelin `AccessControl` |

### Risk Mitigations

- **Over-collateralisation**: Max 70% LTV ensures a safety buffer against price volatility
- **Oracle Price Feeds**: Collateral valued at live market prices (not user-declared)
- **Kink Interest Model**: High utilisation (>80%) triggers steep rate increases, incentivising deposits and discouraging further borrowing
- **Soulbound Receipts**: agUSDC shares are non-transferable, preventing secondary market speculation
- **Health Factor Monitoring**: Loans with health factor < 1.0 are eligible for liquidation

### Admin Wallet Security

The admin wallet must hold `VERIFIER_ROLE` on the `CommodityRegistry` contract. This is a **hot wallet** — it signs transactions directly from the browser. For production:

1. Use a dedicated hardware wallet or multisig for admin actions
2. Never share the admin wallet's private key
3. Monitor the admin wallet for suspicious activity
4. Consider time-locks on role management functions

---

## Getting Started

### Prerequisites

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **Foundry** ([Install](https://book.getfoundry.sh/getting-started/installation))
- **Git**
- **MetaMask** or any WalletConnect-compatible wallet
- **Make** (build tool — pre-installed on macOS/Linux, or via [choco](https://chocolatey.org/) on Windows)

### 1. Local Development (Anvil)

Run everything on your machine — no testnet ETH needed.

```bash
# Clone the repo
git clone --recurse-submodules https://github.com/Chijulybuilds/AgriBridge.git
cd AgriBridge

# Install dependencies
make dependency        # Foundry libraries (forge-std, OpenZeppelin, Chainlink)
npm install            # Frontend dependencies

# Terminal 1: Start local blockchain
anvil

# Terminal 2: Deploy contracts locally
make deploy-local

# Terminal 3: Generate ABIs and start frontend
npm run abis
cp .env.example .env.local
# Edit .env.local with the addresses from the deploy output
npm run dev
```

Open **http://localhost:3000** and connect MetaMask to **Localhost 8545** (chain ID 31337).

### 2. Sepolia Testnet

Deploy against the public testnet.

```bash
# Setup environment
cp .env.example .env
# Fill in:
#   SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
#   PRIVATE_KEY=<deployer_wallet_private_key>
#   ETHERSCAN_API_KEY=<optional — for contract verification>
#   USDC_CONTRACT_ADDRESS=0x6d4bb60203535853ffd8352956dff549c4ba052f  (Sepolia USDC)
#   VERIFIER_ADDRESS=<admin_wallet_address>

# Deploy all contracts
make deploy-all

# The script prints deployed addresses. Copy them.
```

### 3. Frontend Setup

```bash
# Create frontend environment
cp .env.example .env.local

# Contents of .env.local:
# NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS=0x...
# NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS=0x...
# NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS=0x...
# NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS=0x...
# NEXT_PUBLIC_LENDING_POOL_ADDRESS=0x...
# NEXT_PUBLIC_USDC_ADDRESS=0x...
# NEXT_PUBLIC_ADMIN_WALLET=0x... (admin wallet for verifier access)
# NEXT_PUBLIC_CHAIN_ID=11155111 (Sepolia) or 31337 (Anvil)
# NEXT_PUBLIC_RPC_URL=<RPC endpoint>
# NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<from cloud.walletconnect.com>

# Start the frontend
npm run dev
```

---

## Environment Variables

The project uses two environment files:

| File | Template | Purpose | Committed? |
|------|----------|---------|------------|
| `.env` | `.env.example` | Foundry deployment config (RPC URLs, private keys) | ❌ No |
| `.env.local` | `.env.example` | Frontend `NEXT_PUBLIC_*` values for Next.js | ❌ No |

### Frontend Variables (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS` | ✅ | Deployed Registry contract address |
| `NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS` | ✅ | Deployed CommodityToken (ERC-1155) address |
| `NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS` | ✅ | Deployed Price Oracle address |
| `NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS` | ✅ | Deployed AgriShareToken address |
| `NEXT_PUBLIC_LENDING_POOL_ADDRESS` | ✅ | Deployed LendingPool address |
| `NEXT_PUBLIC_USDC_ADDRESS` | ✅ | USDC token address (testnet or mainnet) |
| `NEXT_PUBLIC_ADMIN_WALLET` | For admin | Wallet address with `VERIFIER_ROLE` |
| `NEXT_PUBLIC_CHAIN_ID` | ✅ | `11155111` (Sepolia) or `31337` (Anvil) |
| `NEXT_PUBLIC_RPC_URL` | ✅ | RPC endpoint for the chain |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | For WalletConnect | Project ID from [cloud.walletconnect.com](https://cloud.walletconnect.com) |

### Contracts Variables (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SEPOLIA_URL` | For Sepolia | Alchemy/Infura RPC URL |
| `PRIVATE_KEY` | For Sepolia | Deployer wallet private key |
| `ETHERSCAN_API_KEY` | Optional | For contract verification |
| `ANVIL_PRIVATE_KEY` | For Anvil | Default Anvil account key (pre-filled) |
| `USDC_CONTRACT_ADDRESS` | ✅ | Address of USDC on the target network |
| `VERIFIER_ADDRESS` | ✅ | Wallet granted `VERIFIER_ROLE` |
| `ADMIN_ADDRESS` | Optional | Receives admin rights (defaults to deployer) |

---

## Testing

### Smart Contract Tests (Foundry)

```bash
make test              # Full suite: unit, fuzz, integration
forge test -vvv        # Verbose output
make test-fork         # Tests against a Sepolia fork
make coverage          # Coverage report
make gas               # Gas report
```

The test suite is organised as:
- **`test/unit/`** — Individual contract unit tests
- **`test/fuzz/`** — Fuzz tests with random inputs
- **`test/integration/`** — Cross-contract integration tests (full journey)

### End-to-End Tests (Playwright)

```bash
npm run test:e2e       # Headless (CI)
npm run test:e2e:ui    # Interactive browser UI (debugging)
npx playwright test auth.spec.ts  # Run specific test
```

The E2E suite injects a **mock wallet** into the page, so it needs no browser extension and no private key. It covers:

- Wallet connection flow
- Login / SIWE authentication
- Commodity registration and verification
- Pool deposit and withdrawal

---

## Deployment

### Vercel (Recommended)

The project includes a `vercel.json` configured for Next.js. To deploy:

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add all `NEXT_PUBLIC_*` environment variables in Vercel's dashboard
4. Deploy — the build command (`next build`) compiles everything statically

### Static Hosting (IPFS / 4EVERLAND)

```bash
# Build static export
NEXT_OUTPUT=export npm run build:static
# Output in ./out/ — deploy to IPFS, Fleek, or 4EVERLAND
```

**Note:** Static export disables API routes and server-rendered data — the app reads all data from the chain via the browser.

---

## Theming

AgriBridge supports **dark mode** and **light mode** with a smooth animated toggle.

- **Landing page**: Pill-shaped toggle with sliding knob (🌙/☀️) in the navbar
- **Dashboards**: Compact icon-only toggle in the top bar
- **Persistence**: Choice saved to `localStorage` (`agribridge_theme`)
- **System preference**: Respects `prefers-color-scheme: dark` on first visit
- **Smooth transitions**: 0.25s CSS transitions on all themed properties

### Colour Palettes

**Light mode:** Clean whites, soft greens, subtle borders
**Dark mode:** Deep forest greens, soft white-green text, vibrant accents

Toggle any time by clicking the sun/moon icon in the top navigation.

---

## Project Layout

```
.
├── src/                          # Solidity smart contracts
│   ├── AgriShareToken.sol        # Soulbound receipt token
│   ├── CommodityPriceOracle.sol  # Price oracle per commodity type
│   ├── CommodityRegistry.sol     # Commodity lifecycle manager
│   ├── CommodityToken.sol        # ERC-1155 collateral token
│   ├── LendingPool.sol           # Core lending engine
│   └── interfaces/               # Solidity interface definitions
├── script/                       # Foundry deployment scripts
│   ├── DeployAll.s.sol           # Full deployment (5 contracts + wiring)
│   ├── DeployProtocol.s.sol      # Protocol contracts only
│   └── DeployCommodity*.s.sol    # Individual contract deployments
├── test/                         # Foundry test files
│   ├── unit/                     # Unit tests
│   ├── fuzz/                     # Fuzz tests
│   └── integration/              # Integration tests
├── pages/                        # Next.js Pages Router
│   ├── index.tsx                 # Landing page
│   ├── _app.tsx                  # App shell (providers, auth context)
│   ├── login.tsx                 # SIWE authentication
│   ├── farmer/                   # Farmer dashboard pages
│   ├── investor/                 # Investor dashboard pages
│   └── admin/                    # Admin/verifier pages
├── components/                   # Shared React components
│   ├── layout/DashboardLayout.tsx # Dashboard shell (sidebar, topbar)
│   ├── ThemeToggle.tsx           # Dark/light mode toggle
│   ├── NetworkGuard.tsx          # Wrong-network warning banner
│   ├── TxStatus.tsx              # Transaction status indicator
│   └── withAuth.tsx              # Route guard HOC
├── hooks/                        # Custom React hooks
│   ├── useProtocol.ts            # All Wagmi contract hooks
│   └── useSiweLogin.ts           # SIWE authentication hook
├── lib/                          # Shared libraries
│   ├── auth.ts                   # Session management, SIWE helpers
│   ├── api.ts                    # API stubs (post-backend-removal)
│   ├── supabase.ts               # Supabase stub (no longer used)
│   ├── wagmi.ts                  # Wagmi + RainbowKit configuration
│   ├── theme.tsx                 # Theme context provider
│   └── contracts/
│       ├── config.ts             # Contract address config and helpers
│       └── abis/                 # Generated ABI files (committed)
├── e2e/                          # Playwright end-to-end tests
│   ├── auth.spec.ts              # Auth flow tests
│   ├── journeys.spec.ts          # Full user journey tests
│   └── fixtures/mockWallet.ts    # Injected wallet mock
├── scripts/                      # Utility scripts
│   └── generate-abis.mjs        # ABI generation from Foundry artifacts
├── styles/
│   └── globals.css               # Global styles + theme variables
├── vercel.json                   # Vercel deployment configuration
├── foundry.toml                  # Foundry configuration
├── Makefile                      # Build orchestration
├── next.config.ts                # Next.js configuration
├── tsconfig.json                 # TypeScript configuration
└── package.json                  # Node dependencies and scripts
```

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Branch**: Create a feature branch from `main`
2. **Contracts**: Run `make test` before submitting contract changes
3. **Frontend**: Run `npm run typecheck` and `npm run lint`
4. **Frontend**: Run `npm run test:e2e` for E2E coverage
5. **Commit**: Use conventional commits (`feat:`, `fix:`, `docs:`, etc.)
6. **PR**: Open a PR with a clear description of the change

### Development Workflow

```bash
# 1. Start local blockchain
anvil

# 2. Deploy contracts locally
make deploy-local

# 3. Generate ABIs
npm run abis

# 4. Start frontend dev server
npm run dev

# 5. Run tests
make test
npm run test:e2e
```

---

## Security

### Known Considerations

- **Private keys in `.env`**: Never commit the filled-in `.env` file. The `.gitignore` already excludes it.
- **Admin hot wallet**: The admin wallet signs transactions directly from the browser. For production, consider a hardware wallet or multisig.
- **Oracle centralisation**: The price oracle is currently set by an admin. Consider decentralised oracle integration (Chainlink) for production.
- **No timelock**: Admin functions (role management, oracle updates) execute immediately. A timelock contract is recommended for production.

### Audit Status

The contracts have **not** been externally audited. They are intended for the Sepolia testnet and should undergo a professional audit before mainnet deployment.

### Reporting Vulnerabilities

Please report security vulnerabilities by emailing the project maintainer directly. Do not open a public issue.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <strong>Built with 🌾 by the AgriBridge team</strong>
</div>