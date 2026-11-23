-- Organizers set up their profile (at least a name) before they create or join an organization,
-- so teammates never see an "Unnamed member". The app sends nameless accounts to /welcome first;
-- this trigger is the backstop for create_organization() and accept_invite(). It only applies to
-- signed-in callers (auth.uid() set), not to service-role or SQL seeding.

set lock_timeout = '5s';
set statement_timeout = '60s';

create function private.org_member_needs_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.user_id = auth.uid() and not exists (
       select 1 from public.accounts ac where ac.user_id = new.user_id and btrim(ac.full_name) <> '') then
    raise exception 'add your name to your profile first' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.org_member_needs_name() from public, anon, authenticated;

create trigger org_members_need_name
  before insert on public.org_members
  for each row execute function private.org_member_needs_name();
