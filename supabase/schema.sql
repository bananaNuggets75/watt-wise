-- WattWise database schema (Supabase / Postgres)
--
-- Scope: schema only. Authentication is NOT set up yet, so `user_id` carries
-- a fixed placeholder for now (see PLACEHOLDER_USER_ID below) and has no
-- foreign key to auth.users. When Supabase Auth lands, the "When auth
-- arrives" section at the bottom is the whole migration.
--
-- Shape:
--   accounts (1) ──< bills
--             (1) ──< appliances
--
-- An account is one electricity account/location (e.g. "Cafe Marie"). Bills
-- and appliances both hang off it, which is why the account layer exists
-- before users do: it is what connects a user's data together later.

-- Needed for gen_random_uuid().
create extension if not exists "pgcrypto";


-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
-- customer_account_number is the utility's own identifier printed on the bill
-- (Meralco calls it "CAN"). It is how bills from different months are tied to
-- the same account without a login.
--
-- SECURITY: the CAN is printed on every bill, so it is NOT a secret and must
-- never be accepted as a credential. It groups data; it does not authenticate.
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),

  -- Placeholder until Supabase Auth exists. Every row shares this value for
  -- now; no FK yet because the placeholder has no matching auth.users row.
  user_id uuid not null default '00000000-0000-0000-0000-000000000000',

  -- Nullable: not every bill format prints a CAN. Unique so a repeat CAN
  -- reuses the same account. Postgres allows many NULLs under a unique
  -- index, so CAN-less accounts simply stay separate — matching the API.
  customer_account_number text unique,

  -- Display label only (names repeat, and OCR spells them inconsistently).
  account_name text not null,

  -- Electricity provider / utility company, e.g. "Meralco".
  provider text,

  created_at timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);


-- ---------------------------------------------------------------------------
-- bills
-- ---------------------------------------------------------------------------
-- One electricity statement for a billing period. The numbers come from the
-- upload form (OCR pre-fills them; the user confirms).
--
-- NOTE: the uploaded image itself is never stored — only these extracted
-- values plus a description of the file.
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,

  kwh_used numeric(10, 2) not null check (kwh_used >= 0),
  amount numeric(12, 2) not null check (amount >= 0),

  period_start date,
  period_end date,

  -- Metadata about the uploaded scan (no bytes kept).
  file_name text,
  file_mime_type text,
  file_size integer,

  created_at timestamptz not null default now(),

  -- A period cannot end before it starts.
  constraint bills_period_order check (
    period_start is null or period_end is null or period_end >= period_start
  )
);

create index if not exists bills_account_id_idx on public.bills (account_id);
-- Supports "this account's history, newest first".
create index if not exists bills_account_period_idx
  on public.bills (account_id, period_end desc);


-- ---------------------------------------------------------------------------
-- appliances
-- ---------------------------------------------------------------------------
-- The appliance survey. Feeds the recommendation engine alongside bills
-- (e.g. non-inverter and aging units are what trigger several rules).
create table if not exists public.appliances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,

  -- e.g. "Air Conditioner", "Refrigerator", "Television".
  type text not null,
  quantity integer not null default 1 check (quantity > 0),

  -- Nullable: the survey's advanced fields are optional.
  is_inverter boolean,
  age_years integer check (age_years is null or age_years >= 0),

  created_at timestamptz not null default now()
);

create index if not exists appliances_account_id_idx on public.appliances (account_id);


-- ---------------------------------------------------------------------------
-- When auth arrives
-- ---------------------------------------------------------------------------
-- Everything below is intentionally left commented out. Enabling RLS now
-- would block all access, since there is no authenticated user yet.
--
-- 1. Point user_id at real users and drop the placeholder default:
--
--   alter table public.accounts
--     alter column user_id drop default,
--     add constraint accounts_user_id_fkey
--       foreign key (user_id) references auth.users (id) on delete cascade;
--
-- 2. Turn on row-level security so each user only sees their own data.
--    Bills/appliances are reached through their account's owner.
--
--   alter table public.accounts enable row level security;
--   alter table public.bills enable row level security;
--   alter table public.appliances enable row level security;
--
--   create policy "own accounts" on public.accounts
--     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--
--   create policy "own bills" on public.bills
--     for all using (
--       exists (select 1 from public.accounts a
--               where a.id = bills.account_id and a.user_id = auth.uid())
--     );
--
--   create policy "own appliances" on public.appliances
--     for all using (
--       exists (select 1 from public.accounts a
--               where a.id = appliances.account_id and a.user_id = auth.uid())
--     );
--
-- Claiming an account is then just setting its user_id — the bills and
-- appliances already attached to it come along unchanged.
