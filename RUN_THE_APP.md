# AgriBridge — How to Run the Application

Complete setup guide for local development and deployment.

**Note:** As of this update, the backend has been removed and the app is now a pure dApp with on-chain data storage. All commodity data, SIWE authentication, and verifier actions are handled on-chain.

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **Foundry** ([Install](https://book.getfoundry.sh/getting-started/installation))
- **Git**
- **MetaMask** or any ERC-4337 compatible wallet (browser extension)

### Option 1: Run Everything Locally (Recommended for Development)

This option requires minimal external dependencies and is perfect for UI development.

```bash
# 1. Install dependencies
cd /home/chijuly/STEM
npm install

# 2. In Terminal 1: Start local blockchain (Anvil)
# This starts a local EVM chain on http://127.0.0.1:8545
anvil

# 3. In Terminal 2: Deploy contracts locally
# Uses the Anvil private key from .env
make deploy-local

# This will output contract addresses like:
# CommodityRegistry:      0x1234...
# CommodityToken:         0x5678...
# LendingPool:            0x9abc...
# etc.

# 4. Copy addresses to frontend .env
cp .env.example .env.local
# Edit .env.local and paste the addresses as NEXT_PUBLIC_* variables
# Also set: NEXT_PUBLIC_ADMIN_WALLET=<your_admin_wallet_address>

# 5. In Terminal 3: Start frontend
cd ..
npm run abis  # Generate ABIs from contract artifacts
npm run dev
# Frontend runs at http://localhost:3000
```

**Then:**
- Open http://localhost:3000 in your browser
- Use MetaMask to connect (switch to Localhost 8545 in MetaMask)
- Use Anvil's test accounts (see output from `anvil` command)

**Note:** Admin functionality requires signing transactions directly from a wallet that has `VERIFIER_ROLE` on the `CommodityRegistry` contract.

---

### Option 2: Run Against Sepolia Testnet

This option tests against a real (but test) blockchain network.

#### Setup

```bash
# 1. Get Sepolia ETH from faucet
# https://sepoliafaucet.com/

# 2. Get test USDC
# https://faucet.circle.com/ (Sepolia network)

# 3. Setup .env for contracts
cd /home/chijuly/STEM
cp .env.example .env

# Edit .env with:
SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
PRIVATE_KEY=your_wallet_private_key_with_eth_balance
ETHERSCAN_API_KEY=your_etherscan_api_key  # For verification
USDC_CONTRACT_ADDRESS=0x6d4bb60203535853ffd8352956dff549c4ba052f  # Sepolia USDC
VERIFIER_ADDRESS=your_secondary_wallet_address
ADMIN_ADDRESS=your_wallet_address  # Optional: receives admin rights
```

#### Deploy to Sepolia

```bash
# Deploy all contracts (full wiring)
make deploy-all

# This outputs all deployed addresses. Copy them.
```

#### Setup Frontend for Sepolia

```bash
cp .env.example .env.local

# Edit .env.local:
NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS=0x...
NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_LENDING_POOL_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x6d4bb60203535853ffd8352956dff549c4ba052f

# Wallet with admin privileges (for verifier queue access)
NEXT_PUBLIC_ADMIN_WALLET=your_admin_wallet_address

NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_id  # Get from cloud.walletconnect.com
```

#### Run Frontend

```bash
cd ..
npm run dev
```

---

## 📋 Individual Component Commands

### Frontend Only

```bash
# Install dependencies
npm install

# Generate contract ABIs from Foundry artifacts
npm run abis

# Development server (hot reload)
npm run dev
# Runs at http://localhost:3000

# Build for production
npm run build

# Start production server (after build)
npm start

# Linting
npm run lint

# Type checking
npm run typecheck

# E2E tests with Playwright
npm run test:e2e

# E2E tests with UI (interactive)
npm run test:e2e:ui

# Static export (for IPFS)
NEXT_OUTPUT=export npm run build:static
# Output in: ./out/
```

### Smart Contracts

```bash
# Navigate to root
cd /home/chijuly/STEM

# Install Foundry dependencies
make dependency

# Compile contracts
forge build

# Run all tests (unit, fuzz, integration)
make test

# Run tests with verbose output
forge test -vvv

# Run tests against Sepolia fork
make test-fork

# Coverage report
make coverage

# Gas report
make gas

# Format Solidity files
make fmt

# Verify contracts on Etherscan (after deploy)
make verify
```

---

## 🧪 Testing

### Unit Tests (Contracts)

```bash
cd /home/chijuly/STEM

# Run all tests
make test

# Run specific test file
forge test --match "LendingPoolTest" -vvv

# Run specific test function
forge test --match-contract "LendingPoolTest" --match-test "testBorrow" -vvv

# Run with gas reporting
make gas
```

### E2E Tests (Frontend)

```bash
npm run test:e2e

# Interactive UI (recommended for debugging)
npm run test:e2e:ui

# Run specific test file
npx playwright test auth.spec.ts

# Debug mode
npx playwright test --debug
```

---

## 🔧 Configuration

### Frontend Environment Variables

**File:** `.env.local`

```env
# Contract addresses (from deployment)
NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS=0x...
NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_LENDING_POOL_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...

# Wallet with admin privileges (for verifier queue access)
NEXT_PUBLIC_ADMIN_WALLET=your_admin_wallet_address

# Chain
NEXT_PUBLIC_CHAIN_ID=31337  # or 11155111 for Sepolia
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545  # or Alchemy URL

# WalletConnect (get from cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
```

### Contracts Environment Variables

**File:** `.env`

```env
# Deployment
SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=your_deployer_private_key
ETHERSCAN_API_KEY=your_key

# Anvil (for local deployment)
ANVIL_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Contracts
USDC_CONTRACT_ADDRESS=0x...
VERIFIER_ADDRESS=0x...
ADMIN_ADDRESS=0x...  # Optional
```

---

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

### Anvil Connection Issues

```bash
# Make sure Anvil is running
# Check port 8545 is listening
netstat -an | grep 8545

# Restart Anvil with specific chain ID
anvil --chain-id 31337
```

### MetaMask Network Not Found

1. Open MetaMask
2. Click network dropdown (top left)
3. Add network manually:
   - **Chain ID:** 31337 (or 11155111 for Sepolia)
   - **RPC URL:** http://127.0.0.1:8545 (or your Alchemy URL)
   - **Currency:** ETH

### Contracts Not Deployed

```bash
# Verify address is set
cat .env | grep COMMODITY_REGISTRY_ADDRESS

# Re-deploy if needed
make deploy-local  # For Anvil
make deploy-all    # For Sepolia
```

### Wallet with Admin Privileges Not Working

1. Make sure the wallet has `VERIFIER_ROLE` on the `CommodityRegistry` contract
2. Set `NEXT_PUBLIC_ADMIN_WALLET` to the wallet address
3. When signing in with that wallet, it will be automatically recognized as admin

### Transaction Failures

1. Check gas balance: `anvil --accounts` shows initial balances
2. Verify nonce: Use `web3.eth.getTransactionCount(address)`
3. Check contract is deployed: `cast code <ADDRESS> --rpc-url <RPC>`

---

## 📊 Monitoring & Logs

### Frontend Errors

- Open browser DevTools (F12)
- Check Console tab for errors
- Check Network tab for API requests

### Contract Events

```bash
# Watch LendingPool events
cast logs --address 0xLENDING_POOL_ADDRESS \
  --from-block 0 \
  --rpc-url http://127.0.0.1:8545
```

---

## 🚀 Production Deployment

### Before Going Live

1. ✅ Fix all CRITICAL vulnerabilities (see SECURITY_REVIEW.md)
2. ✅ Run full test suite: `make test coverage`
3. ✅ Deploy to Sepolia testnet first
4. ✅ Get external security audit
5. ✅ Load test the frontend
6. ✅ Setup monitoring and alerting

### Deployment Steps

```bash
# 1. Build contracts
forge build

# 2. Deploy to Sepolia with verification
make deploy-all verify

# 3. Build and deploy frontend
npm run build
# Deploy ./out/ to IPFS, Vercel, or your host

# 4. Set admin wallet
# Update .env.local with NEXT_PUBLIC_ADMIN_WALLET set to your admin wallet
```

---

## 📚 More Information

- **Contracts:** See `README.md` and `ARCHITECTURE.md`
- **Frontend:** See `README.md`
- **Security:** See `SECURITY_REVIEW.md` (CRITICAL)
- **Deployment:** See `script/DeployAll.s.sol`

---

**Happy farming! 🌾**
