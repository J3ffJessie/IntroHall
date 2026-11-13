-- Private notes on connections ("talked about RAG evals, send deck"). One note per person per
-- connection, visible only to its author. Kept after the event (follow-up is the point) and removed
-- with either attendee row (leaving keeps it; account deletion and event purge cascade).

set lock_timeout = '5s';
set statement_timeout = '60s';

create table public.connection_notes (
  owner_attendee uuid not null references public.attendees (id) on delete cascade,
  about_attendee uuid not null references public.attendees (id) on delete cascade,
  event_id       uuid not null references public.events (id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 2000),
  updated_at     timestamptz not null default now(),
  primary key (owner_attendee, about_attendee),
  check (owner_attendee <> about_attendee)
);
create index connection_notes_about_idx on public.connection_notes (about_attendee);
create index connection_notes_event_idx on public.connection_notes (event_id);

alter table public.connection_notes enable row level security;
revoke all on public.connection_notes from anon, authenticated;
grant select on public.connection_notes to authenticated;
-- Writes only through save_connection_note().
create policy connection_notes_read_own on public.connection_notes for select to authenticated
  using (owner_attendee in (select private.my_attendee_ids()));

-- Saves the caller's note about a connection; an empty body deletes it. Works after the event too.
create function public.save_connection_note(p_about_attendee uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_about public.attendees;
  v_me    uuid;
  v_body  text := btrim(coalesce(p_body, ''));
begin
  select * into v_about from public.attendees a where a.id = p_about_attendee;
  select a.id into v_me from public.attendees a
   where a.event_id = v_about.event_id and a.user_id = auth.uid() and a.banned_at is null;
  if v_about.id is null or v_me is null or not exists (
       select 1 from public.connection_requests r
        where r.event_id = v_about.event_id and r.status = 'accepted'
          and least(r.from_attendee, r.to_attendee) = least(v_me, v_about.id)
          and greatest(r.from_attendee, r.to_attendee) = greatest(v_me, v_about.id)) then
    raise exception 'you can only keep notes on your connections' using errcode = '42501';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'notes are at most 2000 characters' using errcode = 'P0001';
  end if;

  if v_body = '' then
    delete from public.connection_notes where owner_attendee = v_me and about_attendee = v_about.id;
  else
    insert into public.connection_notes (owner_attendee, about_attendee, event_id, body)
    values (v_me, v_about.id, v_about.event_id, v_body)
    on conflict (owner_attendee, about_attendee) do update set body = excluded.body, updated_at = now();
  end if;
end;
$$;

revoke all on function public.save_connection_note(uuid, text) from public, anon;
grant execute on function public.save_connection_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Data export: the previous export plus the caller's notes.
-- ---------------------------------------------------------------------------
-- The public name is recreated just below in the same transaction, so clients never see it missing.
-- squawk-ignore renaming-object
alter function public.export_my_data() rename to export_my_data_base;
-- squawk-ignore ban-set-schema
alter function public.export_my_data_base() set schema private;
revoke all on function private.export_my_data_base() from public, anon, authenticated;

create function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return private.export_my_data_base() || jsonb_build_object(
    'connection_notes', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', n.event_id, 'about_attendee', n.about_attendee,
                                          'about_name', ac.full_name, 'body', n.body, 'updated_at', n.updated_at)
                       order by n.updated_at)
        from public.connection_notes n
        join public.attendees me on me.id = n.owner_attendee
        join public.attendees o on o.id = n.about_attendee
        left join public.accounts ac on ac.user_id = o.user_id
       where me.user_id = auth.uid()), '[]'::jsonb));
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
