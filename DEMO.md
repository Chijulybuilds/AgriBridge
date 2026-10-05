# AgriBridge demo

A demo of every feature with **play money only**. Nothing here touches real funds.

- **Demo USDC (dUSDC):** a fake dollar token. Anyone can get more with the "+10k test USDC" button.
- **Three demo accounts:** Verifier, Farmer and Investor. One click signs you in, so no MetaMask is needed.
- **Fresh contracts:** prices stay valid for a year, and the pool starts with 50,000 dUSDC so farmers can borrow straight away.

You can run the demo in two places:

| | On your laptop | Online (Sepolia) |
|---|---|---|
| Who can open it | Only you | Anyone with the link |
| Speed | Instant | About 12 seconds per transaction |
| Setup | One command | Free test ETH plus a deploy, once |
| Best for | Presenting live | Sharing with others |

---

## 1. On your laptop

### What you need (one time)

1. **Node.js 20 or newer.** Then run `npm install` in the project folder.
2. **The contract libraries:** `git submodule update --init --recursive`
3. **Foundry** (`forge` and `anvil`):
   - **Mac / Linux:** `curl -L https://foundry.paradigm.xyz | bash` then `foundryup`
   - **Windows:** `foundryup` can hang. Installing from npm works instead:
     ```bash
     npm install --prefix "$HOME/.foundry-npm" --ignore-scripts @foundry-rs/forge-win32-amd64 @foundry-rs/anvil-win32-amd64 @foundry-rs/cast-win32-amd64
     mkdir -p "$HOME/.foundry/bin"
     cp "$HOME"/.foundry-npm/node_modules/@foundry-rs/*-win32-amd64/bin/*.exe "$HOME/.foundry/bin/"
     ```
     (Run this in Git Bash. The demo looks for the tools in `~/.foundry/bin`.)

### Start it

```bash
npm run demo
```

This starts a private test blockchain, deploys the contracts, and opens the app at **http://localhost:3000**. Go to `/login` and pick a demo account. Press **Ctrl+C** to stop everything. Each start gives you a clean slate.

> Stop any other `npm run dev` for this folder first. Next.js allows only one dev server per folder.

### Check that everything works

With the demo running, in a second terminal:

```bash
npm run demo:check
```

It clicks through the whole story below and checks each step on the blockchain. It takes about a minute and ends with `12 of 12 steps passed`. Run it before you present.

---

## 2. The demo story (what to click)

Use **Logout** (bottom left) to switch between demo accounts.

1. **Farmer:** **Tokenize** → Cocoa, 1000 kg, grade A, a past harvest date, 90 days → *Register on-chain*. **My Commodities** shows it as *Pending*.
2. **Verifier:** **Verification Queue** → *Approve*. Type any inspection and warehouse references, and a report hash such as `0x` followed by 64 `a`s. The farmer now holds crop tokens for the cocoa.
3. **Investor:** **Deposit** → 10,000. The first click approves the dUSDC, the second deposits it.
4. **Farmer:** **Borrow Funds** → pick the cocoa → 4,000. The first click approves the crop tokens, the second borrows. The cocoa now shows *Collateralized*.
5. **Farmer:** **My Loans** → *Repay* → *Full* → submit. The loan closes and the cocoa comes back (*Released*).
6. **Farmer:** tokenize **Cashew**, 1000 kg. **Verifier** approves it. **Farmer** borrows 2,000 against it.
7. **Verifier:** **Prices** → *Simulate price crash (−50%)*. Then **Loans & Liquidation**: the cashew loan's health is now below 1.00. Click *Liquidate*. The verifier pays the debt and receives the cashew tokens.
8. **Verifier:** **Prices** → *Reset to starting prices*.
9. **Investor:** **Deposit** → *Withdraw* → withdraw all. The investor gets back the deposit plus a little interest.

Every account has a **+10k test USDC** button in the top bar.

---

## 3. Online on Sepolia

Sepolia is a public test network: free, but transactions cost **Sepolia ETH** (test money from a "faucet" website).

1. **Create a new wallet for deploying**, for example a new MetaMask account, and fund it with about **0.1 Sepolia ETH** from a Sepolia faucet. A full deploy costs about 0.045 at normal test-network fees.
   **Never use the keys that were leaked in this repo's git history** (wallets `0xb7d9…4f99` and `0xC54d…191f`). The script refuses them.
2. Put the deployer key in `.env`. It's gitignored and must stay private, because this wallet keeps admin rights over the demo contracts:
   ```
   DEPLOYER_PRIVATE_KEY=0x...
   SEPOLIA_URL=https://...   # optional: your own Sepolia RPC; a public one is used otherwise
   ```
3. Create the three demo wallets:
   ```bash
   npm run demo:sepolia -- wallets
   ```
   Send about **0.05 Sepolia ETH** to each address it prints. Check balances with `npm run demo:sepolia -- status`.
4. Deploy:
   ```bash
   npm run demo:sepolia -- deploy
   ```
   It ends by printing the app settings (`NEXT_PUBLIC_...`).
5. In **Vercel → Project → Settings → Environment Variables**, add every printed setting, then redeploy. The same lines in `.env.local` run it locally against Sepolia.
6. Optional: check the online demo end to end:
   ```bash
   DEMO_CHECK_URL=https://your-app.vercel.app DEMO_CHECK_RPC=https://ethereum-sepolia-rpc.publicnode.com npm run demo:check
   ```

`npm run demo:sepolia -- env` prints the settings again at any time.

---

## Safety notes

- **Demo keys are public on purpose.** Locally they are Anvil's published test keys. Online they are built into the app, so anyone with the link can use the demo accounts. They must only ever hold test ETH.
- **The deployer key is private.** It holds the admin role. The demo Verifier only gets the day-to-day roles (verify, set prices, liquidate), so a public demo key cannot take over the contracts.
- **dUSDC is play money with a public faucet.** Never deploy `DemoUSDC` where tokens have real value.

## Troubleshooting

- **"Another next dev server is already running":** stop the other `npm run dev` or `npm run demo` first.
- **Something already uses port 8545:** `npm run demo` reuses a running local chain and deploys fresh contracts to it.
- **Using MetaMask instead of the demo buttons:** add a network with RPC `http://127.0.0.1:8545` and chain ID `31337` (local), or switch to Sepolia (online).
