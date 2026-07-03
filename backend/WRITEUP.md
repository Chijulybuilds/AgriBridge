# AgriBridge Backend — What We Built (Plain-English Write-up)

_A summary for the whole team. No deep coding knowledge needed._

---

## 1. The big picture (in one paragraph)

AgriBridge lets farmers borrow money against their crops. But a website and a
blockchain can't safely talk to each other on their own — you need a trusted
piece in the middle that checks who's who, saves records, and pushes the
"official" actions onto the blockchain. **That middle piece is the backend, and
that's what we just built.** Think of it as the **control room** of the whole
operation.

```
   FRONTEND                BACKEND (the control room)              BLOCKCHAIN
 (what users see)   ───▶   • checks logins                  ───▶  (the vault /
                           • saves records to a database            source of truth)
                           • approves & mints on-chain
                                     │
                                     ▼
                              SUPABASE DATABASE
                            (fast, searchable records)
```

---

## 1.5 How users log in (two steps: account, then wallet)

Logging in happens in **two layers**, based on the team's feedback:

**Step 1 — Create an account / log in (email or Gmail).**
Just like a normal app: the user signs up with an email & password, or clicks
**"Continue with Google."** This is handled by Supabase, so we get secure logins,
password resets, and Google sign-in without building it ourselves. This account
is who they *are*.

**Step 2 — Connect a wallet (inside the dashboard, after logging in).**
Once logged in, the user connects their crypto wallet (like MetaMask) and signs
a short message to prove it's really theirs. It's **free and safe** (no money
moves, no blockchain fee). We then **link that wallet to their account.**

```
STEP 1 — ACCOUNT
  Sign up / log in with email or Google  →  logged in ✅

STEP 2 — WALLET (after login)
  1. Click "Connect Wallet" in the dashboard
  2. Backend sends a one-time message to sign
  3. Wallet signs it (one click, no cost)
  4. Backend checks the signature is genuine
  5. ✅ Wallet is now linked to the account
```

**Why two steps?** The email account is the friendly, familiar identity (and
lets us reach the user, reset passwords, etc.). The wallet is what's actually
needed to hold crypto collateral on the blockchain. Keeping them separate means
a user can log in before they even have a wallet, and we can be sure a linked
wallet truly belongs to that account. New accounts start as **"farmer"**; an
admin can change a role to investor or admin.

## 2. The three types of users (roles)

Every person using AgriBridge is one of three roles. The backend knows which is
which and only lets them do what they're allowed to do:

| Role | Who they are | What they do |
| --- | --- | --- |
| **Farmer** | Owns the crops | Submits a commodity (e.g. 1000kg Grade-A Cocoa) to get a loan |
| **Investor** | Provides the money | Deposits stablecoins into the lending pool to earn yield |
| **Admin** | The backend engineer (you) | Reviews farmer submissions and approves or rejects them |

> Important: when an **Admin** approves a commodity, that's the moment the
> blockchain creates the digital token representing the real crop. So the Admin
> is effectively the quality-control gatekeeper of the whole system.

---

## 3. What actually happens, step by step

This is the exact journey of one commodity, and the backend is involved at every
step:

1. **A farmer submits a crop** on the website → the backend saves it to the
   database with the status **"Pending."**
2. **The admin opens their review queue** → the backend shows all pending
   submissions.
3. **The admin approves it** → the backend tells the blockchain to (a) look up
   the price, (b) create the digital collateral token, and then marks the record
   as **"Verified"** in the database with a link to the blockchain transaction.
4. **If something's wrong, the admin rejects it** → the backend records it as
   **"Rejected."**

Every status is stored in both places: the **blockchain** (the official,
tamper-proof version) and the **database** (a fast copy the website can read
instantly). The backend keeps these two in sync.

---

## 4. What we set up (the concrete deliverables)

### a) A backend service (the code)
A well-organized project written in TypeScript. It's split into clear folders so
different people can work on different parts without stepping on each other:

- **routes** — the list of available web addresses (e.g. "submit a commodity")
- **controllers** — check that incoming requests are valid
- **services** — the actual work: talking to the database and the blockchain
- **middleware** — security guard that checks each user's login
- **config / lib** — connections and settings

### b) A live database (Supabase)
We created a real, running database in the cloud (project name: **agribridge**).
It has three tables:

- **profiles** — every user and their role (farmer / investor / admin)
- **commodities** — a copy of every crop submission and its status
- **verification_reports** — the admin's inspection notes for each approval

It also has **security rules** so, for example, a farmer can only see their own
submissions, while an admin can see everything.

### c) Connected it all together
The backend is wired to both the database and the blockchain. It's ready to run;
it just needs a couple of secret keys filled in (see section 6).

### d) Saved it to GitHub
All the code was committed under the username **Akebra-dev** and pushed to a
separate branch called **`backend/scaffold`**. The team's `main` branch was left
untouched, so everyone can review the work before it's merged in.

---

## 5. Why we made these choices (for the curious)

- **Why a separate backend instead of the website talking to the blockchain
  directly?** Security. Blockchain approvals need a secret key. That key must
  never live in a website (anyone could steal it). It lives safely in the
  backend instead.
- **Why Supabase?** It gives us a database, user logins, and security rules out
  of the box — so we didn't have to build those from scratch.
- **Why a database copy if the blockchain already stores everything?** Reading
  from a blockchain is slow and clunky for a website. A database copy makes the
  app fast, while the blockchain stays the ultimate source of truth.

---

## 6. What's done vs. what's next

### ✅ Done
- Backend code structure built and organized
- Live Supabase database created and configured (with the 3 roles)
- **Two-layer auth**: email/Gmail account login + connect-and-link wallet
- Farmer submit + admin approve/reject workflow
- Everything connected and saved to GitHub (branch `backend/scaffold`)

### ⏳ Needs before it fully runs
1. The database's **service-role key** (copied from the Supabase dashboard)
2. **Enable Google sign-in** in the Supabase dashboard (Auth → Providers → Google)
3. The **blockchain addresses** of the deployed contracts + a funded test wallet

### 🔜 Suggested next steps
- Wire the frontend: Supabase login buttons + a "Connect Wallet" step in the dashboard
- Add an **automatic listener** so blockchain events update the database on their
  own (no manual syncing)
- Add the **investor + lending pool** endpoints (deposits, borrowing, yield)

---

## 7. How a teammate can run it (technical, optional)

```bash
cd backend
cp .env.example .env     # fill in the secret keys
npm install
npm run dev              # starts at http://localhost:4000/health
```

---

**Summary in one sentence for a busy teammate:**
_We built the "control room" backend that connects the AgriBridge website, a live
Supabase database, and the blockchain — with three user roles (farmer, investor,
admin) and a full approve/reject workflow — and pushed it to GitHub for review._
