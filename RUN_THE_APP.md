# Running AgriBridge

Three ways to run it:

1. [**On your computer**](#1-on-your-computer), with a local blockchain. Best for development.
2. [**On Sepolia**](#3-on-sepolia), the public test network. This is what the festival demo uses.
3. [**The tests**](#5-tests): contracts, a Sepolia rehearsal, and the browser journeys.

Sign-in with Google, email or phone needs a free MetaMask Developer account:
[section 2](#2-sign-in-with-google-email-or-phone).

---

## Prerequisites

- **Node.js 20+** and **Git**.
- **Foundry** (`forge`, `anvil`, `cast`):
  - Mac / Linux: `curl -L https://foundry.paradigm.xyz | bash`, then `foundryup`
  - Windows (Git Bash), where `foundryup` can hang:
    ```bash
    npm install --prefix "$HOME/.foundry-npm" --ignore-scripts @foundry-rs/forge-win32-amd64 @foundry-rs/anvil-win32-amd64 @foundry-rs/cast-win32-amd64
    mkdir -p "$HOME/.foundry/bin"
    cp "$HOME"/.foundry-npm/node_modules/@foundry-rs/*-win32-amd64/bin/*.exe "$HOME/.foundry/bin/"
    ```
- In the project folder:
  ```bash
  git submodule update --init --recursive --depth 1
  npm ci
  cp .env.example .env          # contract settings (never commit the filled-in file)
  ```

---

## 1. On your computer

```bash
# Terminal 1: a local blockchain on http://127.0.0.1:8545
make anvil

# Terminal 2: deploy the demo (play-money USDC, two warehouses, a funded pool)
make deploy-local
npm run abis
```

`make deploy-local` prints `NEXT_PUBLIC_…` lines. Put them in `.env.local`, with these three:

```bash
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_DEPLOY_BLOCK=0
```

Then `npm run dev` and open http://localhost:3000.

**Wallets.** Without a MetaMask Developer client ID the app signs in with a browser wallet, which is
the easiest for local work. In MetaMask, add the network *Localhost 8545* (chain ID 31337), then
import these Anvil test accounts. Their keys are published by Foundry: never use them on a real
network.

| Account | Plays | Private key |
|---|---|---|
| Anvil #1 `0x7099…79C8` | farmer | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Anvil #2 `0x3C44…93BC` | investor | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| Anvil #4 `0x15d3…6A65` | **stands in for the verifier Safe** | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a` |

Locally, `make deploy-local` makes Anvil #4 the verifier and admin (`NEXT_PUBLIC_VERIFIER_SAFE`
must match), so you can open http://localhost:3000/verifier with it.

---

## 2. Sign-in with Google, email or phone

The public app signs people in with **MetaMask Embedded Wallets** (formerly Web3Auth): the first
sign-in creates the person's wallet, signing in again on any device brings it back, and
AgriBridge never holds anyone's key.

1. Go to the [MetaMask Developer Dashboard](https://developer.metamask.io) and sign in.
2. Create a project for **Embedded Wallets**, on **Sapphire Devnet** while testing.
3. **Project Settings → General:** copy the **Client ID**. It is public, not a secret.
4. **Allowlist:** add `http://localhost:3000` and your site's address.
5. **Chains and networks:** enable **Ethereum Sepolia**.
6. **Authentication:** turn on **Google**, **Email (passwordless)** and **SMS (passwordless)**.
7. In `.env.local`: `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=<the client ID>`. Restart `npm run dev`.

**Paying people's gas.** To spare users the network fees, turn on **Smart accounts** in the
dashboard, with a bundler and paymaster for Sepolia (for example from Pimlico, free for testnets).
Before relying on it, check that a farmer's smart account receives crop tokens: approve a delivery
and see it in **My stock**.

Leave the client ID empty to sign in with browser wallets instead, as in section 1. The end-to-end
tests always do.

---

## 3. On Sepolia

**First, the Safe.** The verifier Safe `0xDa15…de12` lists `0xb7d9…4f99` as an owner, a key that is
public in this repo's history. Its owners replace it in [Safe{Wallet}](https://app.safe.global)
(**Settings → Signers**), ideally moving to 2 of 3. The deploy script refuses to deploy until then.

Then:

```bash
npm run demo:sepolia -- wallet          # creates the deploy wallet; send it about 0.06 Sepolia ETH
npm run demo:sepolia -- status          # shows its balance
npm run demo:sepolia -- deploy 0xFarmer 0xInvestor
```

- The deploy wallet is a throwaway key kept in `.demo-wallets.json` (gitignored; keep it private).
  It hands every role to the Safe at the end, and the script checks it kept none.
- The farmer and investor addresses get play money. With sign-in by Google, anyone can also use
  **Get test dollars** in the app, so these can be your own test addresses.
- Prices are set at deployment and stay valid for a year; the Safe changes them in
  **Verifier → Prices**. The Chainlink price feeder is left out unless `FUNCTIONS_ROUTER` is set.
- The command writes `.env.local` (keeping your sign-in settings) and prints the same settings for
  your host. `npm run demo:sepolia -- env` prints them again.

**Hosting.** Add those settings, plus `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`, to the host (for example
Vercel → Settings → Environment Variables) and redeploy.

---

## 4. The verifier page

`/verifier` is linked from nowhere, kept out of search engines, and opens only for the Safe; any
other wallet sees "page not found". The contracts accept verifier actions from the Safe alone.

To use it, each Safe owner opens [Safe{Wallet}](https://app.safe.global) on Sepolia, then **Apps →
My custom apps → Add custom Safe App** with `https://<your site>/verifier`. Inside Safe{Wallet} the
page connects as the Safe. Every action becomes a Safe transaction that waits for enough owners to
confirm it.

Its tabs:
- **Intake:** weigh, grade and approve or reject deliveries.
- **Collections:** confirm goods left the warehouse.
- **Advances:** health of every advance, and settling them with the loss cushion.
- **Prices:** set prices.
- **Clearance:** fund it, and list expired stock for feed buyers.
- **Warehouses:** add, edit or close warehouses.
- **Crops:** each crop's rules: decay, borrow limit, settlement point, basis cut, storage fee.

Two admin actions aren't on the page; owners do them in Safe{Wallet}'s Transaction Builder:
- giving the regulator role: `CommodityRegistry.grantRole(REGULATOR_ROLE, address)`
- adding price reporters: `CommodityPriceOracle.addReporter`

---

## 5. Tests

```bash
make test                         # 260 contract tests: unit, fuzz, integration, attacks
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  forge test --match-path test/fork/SepoliaRehearsal.t.sol   # the whole story on a Sepolia fork
npm run typecheck && npm run lint
```

**Browser journeys** (`e2e/`) drive the real app with a test wallet that sends real transactions
to a local chain:

```bash
make anvil                        # in another terminal; restart it before each full run
make deploy-local
npm run test:e2e
```

`auth.spec.ts` checks sign-in, which pages need it, and that `/verifier` stays hidden.
`journeys.spec.ts` plays the whole demo: delivery, grading, an advance and its repayment, a sale
with a bulk deal, collection, investing, a price crash settled by the keeper, the regulator, and
clearance of expired stock. CI runs both on every push.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | the app with hot reload, on port 3000 |
| `npm run build` / `npm start` | production build and server |
| `npm run build:static` | static export in `out/`, for IPFS hosts |
| `npm run abis` | regenerate the app's contract interfaces from `forge build` |
| `make build` / `make test` / `make gas` | contracts: build with sizes, test, gas report |
| `make deploy-local` | the demo on a local anvil |
| `npm run demo:sepolia -- …` | the demo on Sepolia (see above) |
