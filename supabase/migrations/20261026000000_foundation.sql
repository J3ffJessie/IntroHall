-- Phase 0 foundation: `private` helper schema and global `accounts` profile.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- private schema: helper functions used by RLS policies and RPCs.
-- Not listed in [api].schemas, so PostgREST never exposes it. Execute rights
-- are revoked from public/anon and granted to `authenticated` per function.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public, anon;

create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- accounts: one global base profile per person.
-- No FK to auth.users, so the anonymized row survives auth deletion (§3.3).
-- ---------------------------------------------------------------------------
create table public.accounts (
  user_id     uuid primary key,
  full_name   text not null default '' check (char_length(full_name) <= 100),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  headline    text not null default '' check (char_length(headline) <= 140),
  company     text not null default '' check (char_length(company) <= 100),
  links       jsonb not null default '[]'::jsonb
                check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

alter table public.accounts enable row level security;

-- Deny by default; only these grants and policies open access.
revoke all on public.accounts from public, anon, authenticated;
grant select on public.accounts to authenticated;
grant update (full_name, avatar_path, headline, company, links) on public.accounts to authenticated;

-- R3 (co-attendee reads) is added in Phase 2. For now: own row only.
create policy accounts_select_own on public.accounts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy accounts_update_own on public.accounts
  for update to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger accounts_touch_updated_at
  before update on public.accounts
  for each row execute function private.touch_updated_at();

-- Create the base profile when an auth user signs up; prefill name from OAuth metadata.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (user_id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 100)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function private.touch_updated_at() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
