-- Row-Level Security.
--
-- With RLS on, Postgres itself filters every query by who is asking, so a
-- missing WHERE clause in application code can't leak another user's data.
-- This is the main reason the anon key is safe to ship to the browser.
--
-- Ownership runs account -> establishment -> bills/appliances, so the leaf
-- tables check ownership by joining up to the establishment.


-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;

-- A user sees only their own profile row.
create policy "accounts: read own"
  on public.accounts for select
  to authenticated
  using (id = (select auth.uid()));

create policy "accounts: update own"
  on public.accounts for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No insert policy: rows are created by the signup trigger, which runs as
-- security definer and bypasses RLS. No delete policy either — accounts go
-- away with their auth.users row via the cascade.


-- ---------------------------------------------------------------------------
-- establishments
-- ---------------------------------------------------------------------------
alter table public.establishments enable row level security;

-- `using` governs which rows are visible/affected; `with check` governs what
-- may be written. Both are needed, or a user could move a row to another
-- account by updating account_id.
create policy "establishments: own"
  on public.establishments for all
  to authenticated
  using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- bills and appliances
-- ---------------------------------------------------------------------------
-- Reached through the owning establishment.
alter table public.bills enable row level security;
alter table public.appliances enable row level security;

create policy "bills: own"
  on public.bills for all
  to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = bills.establishment_id
        and e.account_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = bills.establishment_id
        and e.account_id = (select auth.uid())
    )
  );

create policy "appliances: own"
  on public.appliances for all
  to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = appliances.establishment_id
        and e.account_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = appliances.establishment_id
        and e.account_id = (select auth.uid())
    )
  );


-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------
-- Shared reference data, not user data: everyone signed in may read it, and
-- only the service role may change it. RLS is still enabled so the tables
-- aren't wide open by default.
alter table public.establishment_types enable row level security;
alter table public.providers enable row level security;
alter table public.appliance_kinds enable row level security;
alter table public.appliance_subtypes enable row level security;

create policy "establishment_types: read" on public.establishment_types
  for select to authenticated using (true);

create policy "appliance_kinds: read" on public.appliance_kinds
  for select to authenticated using (true);

create policy "appliance_subtypes: read" on public.appliance_subtypes
  for select to authenticated using (true);

create policy "providers: read" on public.providers
  for select to authenticated using (true);

-- Providers are the one list users can extend: OCR regularly reads a
-- cooperative that isn't seeded yet, and blocking that would stop a bill
-- being saved. Inserts only — existing rows stay read-only, so nobody can
-- rename a provider other users depend on.
create policy "providers: insert" on public.providers
  for insert to authenticated with check (true);
