-- Realign the database with the account + linked-wallet auth model in the code.
--
-- Background: the live Supabase project had drifted to an older *wallet-only*
-- auth shape (profiles keyed by wallet_address; a table `auth_nonces`; no signup
-- trigger). This migration reconciles it back to the schema in 0001_init.sql.
-- On a fresh database (built from 0001) this is effectively a no-op re-create;
-- its real job is to document/repair the remote drift. All affected tables were
-- empty, so no data was lost.

-- ─── Drop the old wallet-only objects ───
drop table if exists public.auth_nonces cascade;
drop table if exists public.profiles cascade;

-- ─── Profiles (keyed by the Supabase auth account) ───
create table public.profiles (
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
create table public.wallet_link_nonces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  wallet_address text not null,
  nonce text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

-- ─── Auto-create a profile row on signup (email or Google) ───
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

revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- ─── Row Level Security (deny-by-default; backend uses service role) ───
alter table public.profiles enable row level security;
alter table public.wallet_link_nonces enable row level security;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- ─── Backfill profiles for any pre-existing auth users ───
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;
