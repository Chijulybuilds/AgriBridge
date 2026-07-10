-- 1. Drop old tables if they exist to prevent conflicts
drop table if exists verification_reports cascade;
drop table if exists commodities cascade;
drop table if exists wallet_link_nonces cascade;
drop table if exists auth_nonces cascade;
drop table if exists profiles cascade;
drop type if exists commodity_type cascade;
drop type if exists grade cascade;
drop type if exists commodity_status cascade;

-- 2. Enums
create type commodity_type as enum ('Cocoa', 'Rice', 'Maize', 'Cashew', 'Yam');
create type grade as enum ('A', 'B', 'C');
create type commodity_status as enum (
  'Pending', 'Verified', 'Rejected', 'Collateralized', 'Released', 'Liquidated', 'Expired'
);

-- 3. Profiles (keyed by wallet address)
create table profiles (
  wallet_address text primary key,
  display_name text,
  role text not null default 'farmer' check (role in ('farmer', 'investor', 'admin')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- 4. Auth Nonces
create table auth_nonces (
  wallet_address text primary key,
  nonce text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

-- 5. Commodities
create table commodities (
  id uuid primary key default gen_random_uuid(),
  on_chain_id bigint unique,
  farmer_wallet text not null,
  commodity_type commodity_type not null,
  grade grade not null,
  quantity_kg numeric not null check (quantity_kg > 0),
  harvest_date date not null,
  storage_duration_days int not null check (storage_duration_days between 1 and 730),
  status commodity_status not null default 'Pending',
  token_id bigint,
  verifier_wallet text,
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index commodities_farmer_idx on commodities (farmer_wallet);
create index commodities_status_idx on commodities (status);

-- 6. Verification reports
create table verification_reports (
  id uuid primary key default gen_random_uuid(),
  commodity_id uuid not null references commodities (id) on delete cascade,
  inspection_reference text not null,
  warehouse_reference text not null,
  report_hash text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- 7. Row Level Security
alter table profiles enable row level security;
alter table auth_nonces enable row level security;
alter table commodities enable row level security;
alter table verification_reports enable row level security;
