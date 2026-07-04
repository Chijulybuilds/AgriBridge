-- AgriBridge — initial schema
-- The DB is an OFF-CHAIN MIRROR of the protocol. The blockchain is the source
-- of truth for value/collateral; Supabase stores rich metadata, powers the
-- admin dashboard, and gives the frontend fast queries.
--
-- AUTH MODEL (two layers):
--   1. Account — email/password or Google (Gmail) via Supabase Auth. This is
--      the login identity and issues the session token.
--   2. Wallet  — connected AFTER login, inside the dApp dashboard, and LINKED to
--      the account (signature-verified). Needed for on-chain actions.
-- All DB access flows through the backend service-role key; RLS is otherwise
-- deny-by-default (one exception: users may read their own profile).

-- ─── Enums (mirror the Solidity enums in CommodityRegistry.sol) ───
create type commodity_type as enum ('Cocoa', 'Rice', 'Maize', 'Cashew', 'Yam');
create type grade as enum ('A', 'B', 'C');
create type commodity_status as enum (
  'Pending', 'Verified', 'Rejected', 'Collateralized', 'Released', 'Liquidated', 'Expired'
);

-- ─── Profiles (keyed by the Supabase auth account) ───
-- Roles: farmer / investor / admin. 'admin' is the backend engineer who
-- performs verification (distinct from the on-chain VERIFIER_ROLE).
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  wallet_address text unique,          -- linked after login; null until connected
  role text not null default 'farmer' check (role in ('farmer', 'investor', 'admin')),
  created_at timestamptz not null default now(),
  wallet_linked_at timestamptz,
  last_login_at timestamptz
);

-- ─── One-time nonces for wallet linking (signature proof of ownership) ───
create table wallet_link_nonces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  wallet_address text not null,
  nonce text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

-- Auto-create a profile row whenever someone signs up (email or Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The trigger runs as the function owner; nobody should call it directly via
-- the exposed REST RPC endpoint.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- ─── Commodities (mirror of on-chain CommodityRegistry records) ───
create table commodities (
  id uuid primary key default gen_random_uuid(),
  on_chain_id bigint unique,                 -- CommodityRegistry commodityId
  farmer_wallet text not null,
  commodity_type commodity_type not null,
  grade grade not null,
  quantity_kg numeric not null check (quantity_kg > 0),
  harvest_date date not null,
  storage_duration_days int not null check (storage_duration_days between 1 and 730),
  status commodity_status not null default 'Pending',
  token_id bigint,                           -- ERC-1155 token id once minted
  verifier_wallet text,
  tx_hash text,                              -- tx that moved it to this status
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index commodities_farmer_idx on commodities (farmer_wallet);
create index commodities_status_idx on commodities (status);

-- ─── Verification reports (extra off-chain detail for approvals) ───
create table verification_reports (
  id uuid primary key default gen_random_uuid(),
  commodity_id uuid not null references commodities (id) on delete cascade,
  inspection_reference text not null,
  warehouse_reference text not null,
  report_hash text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ─── Row Level Security (deny-by-default; backend uses service role) ───
alter table profiles enable row level security;
alter table wallet_link_nonces enable row level security;
alter table commodities enable row level security;
alter table verification_reports enable row level security;

-- A signed-in user may read their own profile directly (handy for the frontend).
create policy "read own profile" on profiles
  for select using (auth.uid() = id);
