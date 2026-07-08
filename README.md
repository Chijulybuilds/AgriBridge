# AgriBridge — Frontend Overview

## Stack

- **Framework:** Next.js (Pages Router)
- **Auth:** Supabase (Sign-In with Ethereum / wallet-based auth)
- **Wallet connection:** `ethers` (`BrowserProvider`) for MetaMask
- **Styling:** Inline styles using CSS custom properties (`var(--accent-green)`, `var(--bg-primary)`, etc.) — these variables should be defined globally (e.g. in `globals.css` or `_app.tsx`)
- **Icons:** Heroicons (`@heroicons/react`)

## Folder structure (added/changed in this PR)

```
components/
  layout/DashboardLayout.tsx   → shared shell for authenticated dashboard pages
  withAuth.tsx                 → HOC that gates a page behind an authenticated session
lib/
  auth.ts                      → wallet sign-in, session, and current-user helpers
  supabase.ts                  → Supabase client setup
  api.ts                       → API request helper(s) for talking to the backend
pages/
  _app.tsx                     → app wrapper (global styles/providers)
  index.tsx                    → public landing page
  login.tsx                    → wallet connect / sign-in page
  farmer/commodities.tsx       → farmer dashboard: commodities view
  farmer/tokenize.tsx          → farmer dashboard: tokenize a commodity
public/
  videos/                      → hero background video used on the landing page
```

## Auth flow

1. **Landing page (`index.tsx`)** — visitor picks a role (Farmer / Investor) or clicks "Connect Wallet." Every path routes to `/login` first (no dashboard is reachable without an authenticated wallet).
2. **Login page (`login.tsx`)**:
   - On mount, it calls `getSession()` — if a session already exists, it fetches the current user's profile via `getCurrentUser()` and redirects straight to `/{role}/dashboard`, skipping the login button entirely for returning users.
   - On click, `signInWithWallet()` (from `lib/auth.ts`) triggers the MetaMask sign-in flow. On success, it reads the user's role from the returned profile and redirects to `/{role}/dashboard`.
   - Errors (e.g. wallet rejected, no session token returned) are shown inline.
3. **`withAuth.tsx`** wraps dashboard pages (e.g. `farmer/commodities.tsx`, `farmer/tokenize.tsx`) so unauthenticated visits get redirected back to login rather than rendering protected content.
4. **`DashboardLayout.tsx`** provides the shared nav/sidebar shell around farmer/investor dashboard pages.

## Pages included in this PR

| Page | Purpose |
|---|---|
| `index.tsx` | Public marketing/landing page — hero, stats, features, "how it works," CTA |
| `login.tsx` | Wallet-based sign-in for both farmer and investor roles |
| `farmer/commodities.tsx` | Lists a farmer's tokenized/stored commodities |
| `farmer/tokenize.tsx` | Flow for a farmer to tokenize a new commodity |

## Setup / environment

The following environment variables are expected (see `.env.local.example`):
- Supabase URL + anon key (used in `lib/supabase.ts`)
- Any RPC/contract-related values needed for wallet sign-in, if applicable

Run locally:
```bash
npm install
npm run dev
```

## Note for review

`lib/auth.ts` was written independently on the frontend side and may overlap conceptually with the backend's recent **"Rework auth into two layers: account login + linked wallet"** change (`backend/scaffold` branch). Worth a quick side-by-side check to confirm the two layers line up — frontend currently expects a single `signInWithWallet()` call to return both a session token and a role-tagged profile.
