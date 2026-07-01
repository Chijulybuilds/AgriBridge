-- AgriBridge — initial schema
-- The DB is an OFF-CHAIN MIRROR of the protocol. The blockchain is the source
-- of truth for value/collateral; Supabase stores rich metadata, powers the
-- verifier dashboard, and gives the frontend fast queries + auth.

-- ─── Enums (mirror the Solidity enums in CommodityRegistry.sol) ───
create type commodity_type as enum ('Cocoa', 'Rice', 'Maize', 'Cashew', 'Yam');
create type grade as enum ('A', 'B', 'C');
create type commodity_status as enum (
  'Pending', 'Verified', 'Rejected', 'Collateralized', 'Released', 'Liquidated', 'Expired'
);

-- ─── Farmer/investor profiles (linked to Supabase Auth) ───
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  wallet_address text unique,
  display_name text,
  role text not null default 'farmer' check (role in ('farmer', 'investor', 'verifier')),
  created_at timestamptz not null default now()
);

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

-- ─── Row Level Security ───
alter table profiles enable row level security;
alter table commodities enable row level security;
alter table verification_reports enable row level security;

-- Farmers can read their own commodities; verifiers (service role) see all.
create policy "read own commodities"
  on commodities for select
  using (
    farmer_wallet = (select wallet_address from profiles where id = auth.uid())
  );
