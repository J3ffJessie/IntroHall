-- interest_tags_defaults derives created_by / is_official from the caller. Only do that for API
-- callers (auth.uid() set); seeds and maintenance run as postgres and set the columns explicitly.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function private.interest_tags_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.is_official := new.event_id in (select private.my_org_event_ids());
  end if;
  return new;
end;
$$;
