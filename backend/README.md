# AgriBridge Backend

The backend service for the AgriBridge protocol. It sits **between the frontend, Supabase, and the smart contracts**, and is owned by the backend engineer (who also acts as the on-chain **Verifier**).

> One-line pitch for the team: *the backend is the trusted middle layer that turns a farmer's commodity submission into an on-chain, tokenized, collateralizable asset — and mirrors every step in Supabase so the app stays fast and queryable.*

## What the backend is responsible for

| Concern | How |
| --- | --- |
| **Account auth** | **Email/password or Google (Gmail) via Supabase Auth.** The frontend logs in with Supabase; the backend verifies the access token (`requireAuth`). This is the session identity. |
| **Wallet link** | After login, the user connects a wallet and signs a nonce (no gas). The backend verifies the signature and **binds the wallet to the account** (`requireWallet` gates on-chain actions). |
| **Off-chain mirror** | Persists commodity records + verification reports in Supabase (Postgres) so the app doesn't have to read everything from chain. |
| **The Verifier role** | Reviews the pending queue and, on approval, calls `CommodityVerifier.verifyCommodity(...)` on-chain — which prices via the oracle and mints the ERC-1155 collateral token. |
| **Oracle updates** | Pushes commodity prices to `CommodityPriceOracle` using the backend wallet's `PRICE_UPDATER_ROLE`. |

## Architecture at a glance

```
Frontend ──HTTP+JWT──▶  Backend API (this service)
                          │
              ┌───────────┴────────────┐
              ▼                         ▼
      Supabase (Postgres)      Smart contracts (ethers.js)
      off-chain mirror          on-chain source of truth
      • commodities             • CommodityRegistry
      • verification_reports    • CommodityVerifier  (approve → mint)
      • profiles / auth         • CommodityToken (ERC-1155)
                                • CommodityPriceOracle
                                • LendingPool / LiquidityShareToken
```

## Folder structure

```
backend/
├── src/
│   ├── server.ts               # process entry — starts the HTTP server
│   ├── app.ts                  # Express app: middleware + route mounting
│   ├── config/env.ts           # validated environment variables (fails fast)
│   ├── lib/
│   │   ├── supabase.ts         # Supabase clients (admin + per-user)
│   │   └── chain.ts            # ethers provider, verifier signer, addresses
│   ├── middleware/
│   │   ├── auth.ts             # session JWT verification + role guard
│   │   └── errorHandler.ts     # 404 + central error handler
│   ├── routes/index.ts         # REST endpoints
│   ├── controllers/            # request parsing/validation → service calls
│   │   ├── account.controller.ts
│   │   ├── wallet.controller.ts
│   │   ├── commodities.controller.ts
│   │   └── verifier.controller.ts
│   ├── services/               # business logic
│   │   ├── wallet.service.ts     # wallet-link nonce + signature verify
│   │   ├── profile.service.ts    # account profiles + wallet linking
│   │   ├── commodity.service.ts  # Supabase reads/writes
│   │   └── chain.service.ts      # on-chain verify/reject/oracle calls
│   └── types/index.ts          # enums mirroring the Solidity contracts
└── supabase/
    └── migrations/0001_init.sql  # DB schema (mirror of on-chain data)
```

## The request flow (maps 1:1 to ARCHITECTURE.md)

1. `POST /api/commodities` — farmer submits → row saved as **Pending**.
2. `GET /api/verifier/queue` — backend engineer reviews pending items.
3. `POST /api/verifier/commodities/:id/approve` — calls chain (mint ERC-1155) → row becomes **Verified** with the `tx_hash`.
4. `POST /api/verifier/commodities/:id/reject` — calls chain reject → row becomes **Rejected**.

## Running locally

```bash
cd backend
cp .env.example .env      # then fill in Supabase + chain values
npm install
npm run dev               # http://localhost:4000/health
```

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET  | `/health` | – | Liveness check |
| GET  | `/api/account/me` | ✅ | Current signed-in user + profile |
| POST | `/api/wallet/nonce` | ✅ | Get the message to sign to link a wallet |
| POST | `/api/wallet/link` | ✅ | Submit signature → wallet linked to account |
| POST | `/api/commodities` | ✅ + wallet | Farmer submits a commodity |
| GET  | `/api/commodities` | ✅ + wallet | List the caller's own commodities |
| GET  | `/api/verifier/queue` | admin | Pending review queue |
| POST | `/api/verifier/commodities/:id/approve` | admin | Approve + mint on-chain |
| POST | `/api/verifier/commodities/:id/reject` | admin | Reject on-chain |

### Auth flow (two layers)

```
ACCOUNT (frontend ↔ Supabase, email/password or Google):
  supabase.auth.signUp / signInWithPassword / signInWithOAuth('google')
  → Supabase returns an access token; send it as `Authorization: Bearer <token>`

WALLET LINK (after login, inside the dashboard):
  1. POST /api/wallet/nonce  { wallet }             → { message }
  2. wallet.signMessage(message)  (in MetaMask etc.)
  3. POST /api/wallet/link   { wallet, signature }  → { profile }  (wallet bound)
```

> To enable "Login with Gmail": Supabase dashboard → Authentication → Providers →
> Google (add the OAuth client id + secret).

> **Status:** scaffold. The Supabase queries and contract addresses are wired but need a live Supabase project + deployed contract addresses in `.env` before they execute end-to-end.
