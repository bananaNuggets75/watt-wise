-- Lookup tables: the fixed option lists the app offers.
--
-- These replace the free-text fields the API used before (a typed provider
-- name, an is_inverter boolean). Normalising them means "Meralco" and
-- "MERALCO" are one provider, and appliance subtypes can differ per kind
-- (inverter/non-inverter for an aircon, LED/OLED/CRT for a TV) without a
-- separate boolean per variation.
--
-- Seed rows are inserted here rather than in seed.sql so they also exist in
-- the hosted database, not just local resets. They're idempotent, so
-- re-running a migration can't duplicate them.


-- ---------------------------------------------------------------------------
-- establishment_types
-- ---------------------------------------------------------------------------
-- What kind of place an establishment is. Also the basis for peer
-- benchmarking: a cafe is compared against other cafes.
create table if not exists public.establishment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.establishment_types (name)
values ('Household'), ('Cafe'), ('Restaurant'), ('Retail Store'), ('Office')
on conflict (name) do nothing;


-- ---------------------------------------------------------------------------
-- providers
-- ---------------------------------------------------------------------------
-- Electric distribution utilities and cooperatives. Chosen when creating an
-- establishment; a bill defaults to its establishment's provider. OCR may
-- read a provider that isn't listed yet, so rows can be created at runtime —
-- hence no restriction to the seeded set.
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  acronym text,
  created_at timestamptz not null default now()
);

insert into public.providers (name, acronym)
values
  ('Manila Electric Company', 'Meralco'),
  ('Visayan Electric Company', 'VECO'),
  ('Davao Light and Power Company', 'Davao Light'),
  ('Cagayan Electric Power and Light Company', 'CEPALCO'),
  ('Iloilo Electric Cooperative', 'ILECO')
on conflict (name) do nothing;

-- OCR matches on whatever is printed on the bill, which is usually the short
-- form. Case-insensitive so "MERALCO" and "Meralco" resolve to one row.
create unique index if not exists providers_acronym_lower_idx
  on public.providers (lower(acronym))
  where acronym is not null;


-- ---------------------------------------------------------------------------
-- appliance_kinds
-- ---------------------------------------------------------------------------
-- has_subtype tells the survey UI whether to show the subtype selector at
-- all, so it can be driven by data instead of hardcoding which appliances
-- have variants.
create table if not exists public.appliance_kinds (
  id uuid primary key default gen_random_uuid(),
  appliance_name text not null unique,
  has_subtype boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.appliance_kinds (appliance_name, has_subtype)
values
  ('Air Conditioner', true),
  ('Refrigerator', true),
  ('Television', true),
  ('Washing Machine', true),
  ('Water Heater', false),
  ('Electric Fan', false),
  ('Lighting', true)
on conflict (appliance_name) do nothing;


-- ---------------------------------------------------------------------------
-- appliance_subtypes
-- ---------------------------------------------------------------------------
-- Variants of a kind. The survey filters these by the chosen kind, which is
-- why they hang off kind_id rather than being one global list.
create table if not exists public.appliance_subtypes (
  id uuid primary key default gen_random_uuid(),
  kind_id uuid not null references public.appliance_kinds (id) on delete cascade,
  subtype_name text not null,
  created_at timestamptz not null default now(),

  -- The same name may appear under different kinds, but not twice under one.
  unique (kind_id, subtype_name),

  -- Redundant on its own (id is already unique), but it gives appliances a
  -- composite key to point at, which is what stops a row claiming e.g. an
  -- Air Conditioner of subtype "OLED".
  unique (id, kind_id)
);

create index if not exists appliance_subtypes_kind_id_idx
  on public.appliance_subtypes (kind_id);

-- Seeded by kind name so this doesn't depend on generated uuids.
insert into public.appliance_subtypes (kind_id, subtype_name)
select k.id, s.subtype_name
from public.appliance_kinds k
join (
  values
    ('Air Conditioner', 'Inverter'),
    ('Air Conditioner', 'Non-inverter'),
    ('Refrigerator',    'Inverter'),
    ('Refrigerator',    'Non-inverter'),
    ('Washing Machine', 'Inverter'),
    ('Washing Machine', 'Non-inverter'),
    ('Television',      'LED/LCD'),
    ('Television',      'OLED'),
    ('Television',      'CRT'),
    ('Lighting',        'LED'),
    ('Lighting',        'Fluorescent'),
    ('Lighting',        'Incandescent')
) as s (kind_name, subtype_name) on s.kind_name = k.appliance_name
on conflict (kind_id, subtype_name) do nothing;
