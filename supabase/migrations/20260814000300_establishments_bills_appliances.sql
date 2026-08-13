-- Core data: establishments and the bills and appliances recorded for them.


-- ---------------------------------------------------------------------------
-- establishments
-- ---------------------------------------------------------------------------
-- A place whose electricity is being tracked: a household, a cafe, a branch.
-- Every user has at least one; additional ones are optional. This is the
-- layer that owns data, so a user with two cafes keeps their bills separate.
--
-- type_id and provider_id are required, so an establishment is created during
-- onboarding (once the user has chosen them) rather than by the signup
-- trigger, which only creates the account row.
create table if not exists public.establishments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,

  -- Restricted, not cascading: removing a type or provider that is still in
  -- use should fail rather than silently delete someone's establishment.
  type_id uuid not null references public.establishment_types (id) on delete restrict,
  provider_id uuid not null references public.providers (id) on delete restrict,

  name text not null,
  address text,

  -- Used to benchmark against nearby establishments of the same type.
  -- Optional: the user may skip the map step, and benchmarking then falls
  -- back to a wider comparison.
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),

  created_at timestamptz not null default now()
);

create index if not exists establishments_account_id_idx
  on public.establishments (account_id);
-- Supports "nearby establishments of the same type" for benchmarking.
create index if not exists establishments_type_location_idx
  on public.establishments (type_id, latitude, longitude);


-- ---------------------------------------------------------------------------
-- bills
-- ---------------------------------------------------------------------------
-- One electricity statement for a billing period. Values come from the upload
-- form, where OCR pre-fills them and the user confirms.
--
-- NOTE: the uploaded image is never stored — only these values and a
-- description of the file.
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,

  -- Defaults to the establishment's provider; kept per bill because a
  -- statement can name a different one (and OCR may read a provider the
  -- establishment isn't set to), which the app resolves with the user.
  provider_id uuid references public.providers (id) on delete restrict,

  -- The utility's own account number printed on the bill ("CAN" on a Meralco
  -- bill). Useful for matching statements to an establishment.
  -- SECURITY: printed on every bill, so it is not a secret and must never be
  -- accepted as a credential.
  customer_account_number text,

  kwh_used numeric(10, 2) not null check (kwh_used >= 0),
  amount numeric(12, 2) not null check (amount >= 0),

  period_start date,
  period_end date,

  -- Metadata about the uploaded scan (no bytes kept).
  file_name text,
  file_mime_type text,
  file_size integer check (file_size is null or file_size >= 0),

  created_at timestamptz not null default now(),

  constraint bills_period_order check (
    period_start is null or period_end is null or period_end >= period_start
  )
);

create index if not exists bills_establishment_id_idx
  on public.bills (establishment_id);
-- Supports "this establishment's history, newest period first".
create index if not exists bills_establishment_period_idx
  on public.bills (establishment_id, period_end desc);


-- ---------------------------------------------------------------------------
-- appliances
-- ---------------------------------------------------------------------------
-- The appliance survey. Feeds the recommendation engine: its non-inverter and
-- aging-unit rules read these rows.
create table if not exists public.appliances (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,

  kind_id uuid not null references public.appliance_kinds (id) on delete restrict,

  -- Null when the kind has no variants (a ceiling fan), or when the user
  -- skipped the optional detail.
  subtype_id uuid references public.appliance_subtypes (id) on delete restrict,

  quantity integer not null default 1 check (quantity > 0),
  age_years integer check (age_years is null or age_years >= 0),

  created_at timestamptz not null default now(),

  -- Pairs the subtype with its kind so a row can't claim, say, an Air
  -- Conditioner of subtype "OLED". Relies on the (id, kind_id) unique
  -- constraint on appliance_subtypes.
  constraint appliances_subtype_matches_kind
    foreign key (subtype_id, kind_id)
    references public.appliance_subtypes (id, kind_id)
);

create index if not exists appliances_establishment_id_idx
  on public.appliances (establishment_id);
