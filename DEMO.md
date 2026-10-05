# AgriBridge demo on Sepolia

The demo runs on **Sepolia**, a free public test network. You sign in with **MetaMask test accounts**, and every action is a real transaction that anyone can open on [Sepolia Etherscan](https://sepolia.etherscan.io).

No real money is involved:

- **Demo USDC (dUSDC)** is a play-money dollar. The **"+10k test USDC"** button in the top bar gives you more.
- **Transaction fees** are paid in **Sepolia ETH**, which is free from a "faucet" website.

---

## 1. One-time setup: deploy the contracts

You need **Node.js 20+**, then in the project folder:

```bash
npm install
git submodule update --init --recursive
```

You also need **Foundry** (`forge`):

- **Mac / Linux:** `curl -L https://foundry.paradigm.xyz | bash` then `foundryup`
- **Windows** (Git Bash). `foundryup` can hang, but npm works:
  ```bash
  npm install --prefix "$HOME/.foundry-npm" --ignore-scripts @foundry-rs/forge-win32-amd64 @foundry-rs/anvil-win32-amd64 @foundry-rs/cast-win32-amd64
  mkdir -p "$HOME/.foundry/bin"
  cp "$HOME"/.foundry-npm/node_modules/@foundry-rs/*-win32-amd64/bin/*.exe "$HOME/.foundry/bin/"
  ```

Then:

1. **Create the deploy wallet.** This is a separate throwaway wallet, so nobody has to export a MetaMask key.
   ```bash
   npm run demo:sepolia -- wallet
   ```
   It prints an address. Its key is saved in `.demo-wallets.json` (gitignored). **Keep that file private:** this wallet has admin rights over the demo contracts.
2. **Send the deploy wallet about 0.06 Sepolia ETH**, from a Sepolia faucet or from your MetaMask test account.
3. **Deploy**, giving your MetaMask test address:
   ```bash
   npm run demo:sepolia -- deploy 0xYourMetaMaskAddress
   ```
   This account becomes the **Verifier** (it can approve crops, set prices and liquidate) and receives play-money USDC. You can also give separate addresses for a farmer and an investor: `deploy 0xVerifier 0xFarmer 0xInvestor`.
   The command writes `.env.local`, so the app uses this deployment, and prints the same settings for Vercel.
4. **Run the app:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000. To put it online, add the printed settings in **Vercel → Settings → Environment Variables** and redeploy. `npm run demo:sepolia -- env` prints them again.
5. **Optional: more verifiers.** Make a teammate's MetaMask account a verifier, with play money:
   ```bash
   npm run demo:sepolia -- grant 0xTheirAddress
   ```

`npm run demo:sepolia -- status` shows the Sepolia ETH of the deploy wallet and your accounts.

---

## 2. MetaMask

- Show test networks (**Settings → Advanced → Show test networks**) and select **Sepolia**.
- Each account needs a little Sepolia ETH for fees. About 0.02 covers a full demo.
- Every action asks MetaMask to confirm. Some take two confirmations, for example approving dUSDC and then depositing it.
- If MetaMask shows *"MetaMask encountered an error"* while docked in the browser's side panel, open it as a pop-up instead. That's a MetaMask bug, not the app.

---

## 3. The demo story

Sign in with the Verifier account. It opens in the **Verifier** view. Use **Switch to Farmer / Investor / Verifier** at the bottom left to play every role with the same account.

1. **Farmer → Tokenize:** Cocoa, 1000 kg, grade A, a past harvest date, 90 days. **My Commodities** shows it as *Pending*.
2. **Verifier → Verification Queue → Approve.** Type any inspection and warehouse references, and a report hash such as `0x` followed by 64 `a`s. Then click *View the transaction on Etherscan*.
3. **Investor → Deposit → 10,000.**
4. **Farmer → Borrow Funds →** pick the cocoa → 4,000. The crop is now *Collateralized*. Then **My Loans → Repay → Full**: the loan closes and the crop comes back (*Released*).
5. **Farmer:** tokenize **Cashew** (1000 kg). **Verifier** approves it. **Farmer** borrows 2,000 against it.
6. **Verifier → Prices → Simulate price crash (−50%).** Then **Loans & Liquidation**: the cashew loan's health is below 1.00. Click *Liquidate*. Afterwards, **Prices → Reset to starting prices**.
7. **Investor → Deposit → Withdraw** everything.
8. **On-chain Activity** (in every view) lists all of it, newest first. Each row links to its transaction on Etherscan, and the page links the contracts too.

For a more realistic demo, use a separate MetaMask account for the farmer and another for the investor. Any account can farm or invest; only verifiers need the role, from `deploy` or `grant`.

---

## Safety notes

- `.demo-wallets.json` holds the deploy wallet's key. Keep it private and never commit it (it's gitignored).
- **Never use the keys leaked in this repo's git history** (wallets `0xb7d9…4f99` and `0xC54d…191f`). The script refuses them.
- dUSDC is play money with a public faucet. Never deploy `DemoUSDC` where tokens have real value.

## Troubleshooting

- **"Your wallet is on the wrong network":** click *Switch to Sepolia*, or pick Sepolia in MetaMask.
- **"Contract addresses are not configured":** run the deploy step, or add the settings in Vercel.
- **A transaction seems slow:** Sepolia confirms in about 12 seconds. The status box says when it's done.
