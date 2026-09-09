-- AgriBridge — Sign-In with Ethereum hardening
--
-- The signed login message now follows SIWE shape and binds the domain, URI,
-- chain id, issue time and expiry. The backend rebuilds that message verbatim
-- at verification time, so `issued_at` has to be persisted alongside the nonce
-- rather than recomputed, otherwise the rebuilt message would not match what
-- the wallet actually signed.

alter table auth_nonces
  add column if not exists issued_at timestamptz not null default now();

-- Reserved for a future optional account layer (email login alongside wallet).
-- Nullable and unique-when-present, so adding it later needs no destructive
-- migration. Identity today remains the wallet address.
alter table profiles
  add column if not exists email text;

create unique index if not exists profiles_email_key
  on profiles (email)
  where email is not null;

-- Wallet addresses are stored lowercased by the backend. Enforce it in the
-- database too, so a mixed-case insert cannot create a duplicate identity that
-- lookups by lowercased address would then miss.
alter table profiles
  drop constraint if exists profiles_wallet_lowercase;
alter table profiles
  add constraint profiles_wallet_lowercase
  check (wallet_address = lower(wallet_address));

alter table auth_nonces
  drop constraint if exists auth_nonces_wallet_lowercase;
alter table auth_nonces
  add constraint auth_nonces_wallet_lowercase
  check (wallet_address = lower(wallet_address));

-- Expired nonces are dead weight; index the column so cleanup stays cheap.
create index if not exists auth_nonces_expires_idx on auth_nonces (expires_at);
