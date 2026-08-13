#!/usr/bin/env bash
#
# Apply every migration to a throwaway Postgres database and assert the
# behaviour the schema is supposed to guarantee.
#
# Why this exists: the Row-Level Security policies are the last line of
# defence for user data, and a policy that silently doesn't apply looks
# exactly like one that does — until someone reads a row they shouldn't. The
# only way to know is to run the SQL and try.
#
# Uses a local Postgres rather than `supabase db start`, which needs Docker.
# The Supabase-provided pieces the migrations depend on (auth.users,
# auth.uid(), the authenticated role) are stubbed below.
#
# Usage:  pnpm test:db        (needs a local Postgres accepting connections)

set -euo pipefail

DB="wattwise_migration_test_$$"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0

cleanup() { psql -q -c "drop database if exists ${DB}" postgres >/dev/null 2>&1 || true; }
trap cleanup EXIT

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAILURES=$((FAILURES + 1)); }

# Assert a psql query outputs an expected value.
expect_eq() {
  local label="$1" expected="$2" actual
  actual="$(psql -q -t -A -d "${DB}" -f - 2>&1 | tail -1 || true)"
  if [[ "${actual}" == "${expected}" ]]; then pass "${label}"; else
    fail "${label} (expected '${expected}', got '${actual}')"
  fi
}

# Assert a statement is rejected.
expect_error() {
  local label="$1" out
  out="$(psql -q -d "${DB}" -f - 2>&1 || true)"
  if grep -qi "ERROR" <<<"${out}"; then pass "${label}"; else
    fail "${label} (statement was allowed)"
  fi
}

echo "Creating ${DB} ..."
psql -q -c "create database ${DB}" postgres

echo "Stubbing the Supabase-provided objects ..."
psql -v ON_ERROR_STOP=1 -q -d "${DB}" <<'SQL'
create schema if not exists auth;
create extension if not exists "pgcrypto";
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
-- Stand-in for Supabase's auth.uid(): reads whatever the session claims.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
-- Roles are cluster-wide, so this survives between runs.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
SQL

echo "Applying migrations ..."
for f in "${ROOT}"/supabase/migrations/*.sql; do
  echo "  - $(basename "${f}")"
  psql -v ON_ERROR_STOP=1 -q -d "${DB}" -f "${f}"
done

# Supabase grants these to the authenticated role by default.
psql -q -d "${DB}" >/dev/null <<'SQL'
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
SQL

echo
echo "Schema"
expect_eq "signup trigger creates the account row" "1" <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'a@t.com', '{"full_name":"Kenan"}');
select count(*) from public.accounts where id = '11111111-1111-1111-1111-111111111111';
SQL

expect_eq "lookup tables are seeded" "t" <<'SQL'
select (select count(*) from establishment_types) > 0
   and (select count(*) from providers) > 0
   and (select count(*) from appliance_subtypes) > 0;
SQL

expect_eq "row-level security is on for every table" "0" <<'SQL'
select count(*) from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
SQL

# Seed two users' data for the checks below.
psql -q -d "${DB}" >/dev/null <<'SQL'
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333','b@t.com');
insert into public.establishments (id, account_id, type_id, provider_id, name)
select '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
       (select id from establishment_types where name='Cafe'),
       (select id from providers where acronym='Meralco'), 'Cafe Marie';
insert into public.establishments (id, account_id, type_id, provider_id, name)
select '44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333',
       (select id from establishment_types where name='Restaurant'),
       (select id from providers where acronym='VECO'), 'Bob Diner';
insert into public.bills (establishment_id, kwh_used, amount)
values ('22222222-2222-2222-2222-222222222222', 312, 1785.50),
       ('44444444-4444-4444-4444-444444444444', 200, 900.00);
SQL

echo
echo "Constraints"
expect_error "an appliance subtype from another kind is rejected" <<'SQL'
insert into public.appliances (establishment_id, kind_id, subtype_id, quantity)
select '22222222-2222-2222-2222-222222222222',
       (select k.id from appliance_kinds k where k.appliance_name='Air Conditioner'),
       (select s.id from appliance_subtypes s
          join appliance_kinds k on k.id = s.kind_id
         where k.appliance_name='Television' and s.subtype_name='OLED'), 1;
SQL

expect_error "a bill period ending before it starts is rejected" <<'SQL'
insert into public.bills (establishment_id, kwh_used, amount, period_start, period_end)
values ('22222222-2222-2222-2222-222222222222', 10, 10, '2026-06-30', '2026-06-01');
SQL

expect_error "negative usage is rejected" <<'SQL'
insert into public.bills (establishment_id, kwh_used, amount)
values ('22222222-2222-2222-2222-222222222222', -5, 10);
SQL

echo
echo "Row-level security"
expect_eq "a user sees only their own establishment" "Cafe Marie" <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select string_agg(name, ',') from public.establishments;
SQL

expect_eq "the other user sees only theirs" "Bob Diner" <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select string_agg(name, ',') from public.establishments;
SQL

expect_eq "a user sees only their own bills" "1" <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select count(*) from public.bills;
SQL

expect_eq "a session with no user sees nothing" "0" <<'SQL'
set role authenticated;
select count(*) from public.establishments;
SQL

expect_error "writing into another user's establishment is refused" <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.bills (establishment_id, kwh_used, amount)
values ('44444444-4444-4444-4444-444444444444', 999, 999);
SQL

expect_eq "another user's establishment cannot be reassigned" "33333333-3333-3333-3333-333333333333" <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.establishments set account_id = '11111111-1111-1111-1111-111111111111'
where id = '44444444-4444-4444-4444-444444444444';
reset role;
select account_id from public.establishments where id = '44444444-4444-4444-4444-444444444444';
SQL

echo
if (( FAILURES > 0 )); then
  echo "${FAILURES} check(s) failed."
  exit 1
fi
echo "All schema checks passed."
