# AgriBridge festival demo

How to show AgriBridge from start to finish, one role at a time. Everything runs on **Sepolia**,
a free public test network, with **play money**: every step is a real transaction that anyone can
open on [Sepolia Etherscan](https://sepolia.etherscan.io), and nothing costs real money.

The same story runs automatically on a local chain in `e2e/journeys.spec.ts`, so every step below
is tested.

---

## Who is who

| Role | Who plays it | How they sign in |
|---|---|---|
| **Farmer** | a volunteer | Google, on the farmer's laptop or phone |
| **Investor** | a volunteer | email (a one-time code) |
| **Buyer** | a volunteer | phone number (an SMS code) |
| **Verifier** (the warehouse team) | two of the Safe's owners | Safe{Wallet}, with AgriBridge opened inside it |
| **Regulator** | a team member | any sign-in; the Safe gives them the role |

Nobody needs a crypto wallet: signing in creates one. Everyone gets play dollars from the
**Get test dollars** button at the top of the app.

## Before the day

1. The contracts are deployed on Sepolia and the app is online: see [RUN_THE_APP.md](RUN_THE_APP.md).
2. The Safe's leaked owner has been replaced, ideally making it 2 of 3 owners (see
   [RUN_THE_APP.md](RUN_THE_APP.md)). **Enough owners to sign must be at the demo** (or on their
   phones): every verifier action waits for their confirmations.
3. Each owner has opened the app inside Safe{Wallet} once (**Apps → My custom apps → Add custom
   Safe App**, address `https://<your site>/verifier`).
4. Prices are set at deployment: today's world prices for cocoa, rice, maize and soybeans, and
   local estimates for cashew and yam. Only the Safe can change them.

---

## The story (about 15 minutes)

### 1. The farmer delivers a crop
**Farmer → Deliver a crop.** Cocoa, the Ibadan warehouse, 1,000 kg, harvested today. The delivery
appears as *Pending*.

> Say: the farmer brings the crop to a partner warehouse. Nothing happens on the blockchain until
> the warehouse has weighed and checked it.

### 2. The warehouse grades it
**Verifier (in Safe{Wallet}) → Intake.** Enter the measured weight (1,000 kg), Grade A, and attach
the signed inspection report (its fingerprint is stored on-chain, not the file). **Approve**, then
the second owner confirms in Safe{Wallet}.

> Say: only this Safe can verify; the contract itself refuses anyone else. The page isn't linked
> anywhere, and for any other wallet it looks like a missing page.

### 3. The crop is now stock in the farmer's name
**Farmer → My stock:** 1,000 kg of Grade A cocoa, its value today, and **Value over time**: how
much it will be worth each month as it ages, until it expires after 540 days.

### 4. An investor funds the pool
**Investor → Get test dollars → Invest $5,000.** The overview shows their money in the pool, what
investors earn now, and the loss cushion that absorbs bad debt before they do.

### 5. The farmer gets an advance
**Farmer → Get an advance.** Repay by: two months from now. The limit appears (about $2,280 at
today's prices); take **$1,000**. **My advances** shows what's owed, that it's *Healthy*, and the
price at which the crop would be sold.

> Say: the limit is half of what the crop will be worth on the end date, because it loses value as
> it ages. Interest is about 5% a year when the pool is mostly unused, rising as more is lent out.

### 6. The farmer sells some on the market
**Farmer → Sell.** 500 kg, *Follow the market* at 100%, and a bulk deal: **10% off orders of 200 kg
or more.**

### 7. A buyer buys and collects
**Buyer → Get test dollars → Market.** The listing shows the bulk deal. **Buy 200 kg**: the total
already includes the discount. Then **Collect → I'll pick it up**: the storage fee is shown first.
**Verifier → Collections → Goods have left: confirm** (two signatures).

> Say: buyers can also resell instead of collecting. That's how stock turns back into cash.

### 8. A price crash, and what protects investors
**Verifier → Prices:** set cocoa to **$2.50/kg** (it was about $5.85). **Verifier → Advances:** the
farmer's advance is now *At risk*. **Settle due advances with the cushion.**

**Farmer → My advances:** the advance is *Liquidated*. Enough crop was sold to cover the debt plus
5%, the rest came back, and the farmer keeps the $1,000.

> Say: anyone may settle an advance once it reaches 80% of the crop's value. If nobody does, the
> keeper settles it from the cushion. In production the price comes from Chainlink and local price
> reporters; for the festival, the Safe sets it.

### 9. The regulator
**Regulator → Regulator:** freeze the cocoa lot. Frozen stock can't be borrowed against, sold, moved
or collected. Unfreeze it again.

### 10. The record
**Activity** lists every step, newest first. Each line links to its transaction on Sepolia Etherscan.

Set cocoa back to $5.85 in **Verifier → Prices** before the next run.

---

## What the judges asked for, and where it is

| The brief | In AgriBridge |
|---|---|
| Tokenized commodities with quantity, quality and storage location | One token per kilogram per lot, with the measured weight, grade, warehouse and the inspection report's fingerprint on-chain (`CommodityRegistry`, `CommodityToken`) |
| A lending pool: investors provide liquidity, farmers borrow | `LendingPool`: shares for investors, advances against crop, interest every second |
| Oracle prices, automatic LTV and liquidation | `CommodityPriceOracle` with staleness limits, a 10% move cap and a circuit breaker; Chainlink Functions and a 2-of-3 reporter quorum are built and tested, switched off for the demo; liquidation at 80% by anyone, or the keeper |
| Security against reentrancy, flash loans and oracle manipulation | [SECURITY.md](SECURITY.md): each threat, its protection, and the test that proves it |
| A permissioned verification layer | One verifier only, a 2-of-3 Safe; its page is hidden; a regulator can freeze stock |
| Dashboards for investors and farmers | Farmer overview, My stock, My advances; investor overview and Risk (every advance's health and the prices behind it) |

## Troubleshooting

- **"Sent to the Safe…" and nothing happens:** the other owners still have to confirm it in Safe{Wallet}.
- **"The price for this crop is out of date":** the Safe sets it again in **Verifier → Prices**.
- **A step is slow:** Sepolia confirms in about 12 seconds; the status box says when it's done.
- **The wrong account is signed in:** **Sign out** at the bottom of the sidebar.

## Safety notes

- The leaked keys in this repo's git history (`0xb7d9…4f99`, `0xC54d…191f`) must never be used.
  `npm run demo:sepolia` refuses to deploy while either is an owner of the Safe.
- The demo's dollars are play money with a public faucet. Never deploy `DemoUSDC` where tokens
  have real value.
