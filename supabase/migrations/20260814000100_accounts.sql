-- Accounts: one row per authenticated user.
--
-- Supabase owns the auth.users table and it can't be extended directly, so
-- this is the usual companion ("profile") table: same id, in our schema,
-- safe to reference with foreign keys and to read from the client.
--
-- Everything a user owns hangs off this row:
--   accounts (1) ──< establishments (1) ──< bills
--                                     (1) ──< appliances

create extension if not exists "pgcrypto";

create table if not exists public.accounts (
  -- Same id as the auth user; deleting the user deletes the account.
  id uuid primary key references auth.users (id) on delete cascade,

  -- Mirrored from auth.users for convenient display. Not the source of
  -- truth for sign-in — auth.users is.
  email text,
  full_name text,

  created_at timestamptz not null default now()
);

comment on table public.accounts is
  'Profile row for an authenticated user; owns establishments.';


-- ---------------------------------------------------------------------------
-- Create the account row automatically on signup
-- ---------------------------------------------------------------------------
-- Without this, a user could sign up and have nowhere to hang their data.
-- The trigger runs as the definer because the signing-up user has no rights
-- on public.accounts yet, and search_path is pinned to defeat search-path
-- hijacking (a Supabase linter requirement for security definer functions).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (id, email, full_name)
  values (
    new.id,
    new.email,
    -- Supabase puts anything passed at signup in raw_user_meta_data.
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
