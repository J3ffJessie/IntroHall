-- Contact export: the caller's connections at one event, with their profile links and the caller's
-- private note, for a vCard / CSV download. Accepted connections only; blocked pairs and banned
-- attendees are left out. Works after the event and after the caller leaves (notes are kept for
-- follow-up), but not for a banned caller. Profile links are shared with connections only, here.

set lock_timeout = '5s';
set statement_timeout = '60s';

create function public.export_contacts(p_event_id uuid)
returns table (
  other_attendee  uuid,
  full_name       text,
  headline        text,
  company         text,
  links           jsonb,
  connected_at    timestamptz,
  note            text,
  conversation_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid;
begin
  select a.id into v_me from public.attendees a
   where a.event_id = p_event_id and a.user_id = auth.uid() and a.banned_at is null;
  if v_me is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  return query
    select o.id, ac.full_name, ac.headline, ac.company, ac.links,
           coalesce(r.responded_at, r.created_at), n.body, c.id
      from public.connection_requests r
      join public.attendees o on o.id = case when r.from_attendee = v_me then r.to_attendee else r.from_attendee end
      join public.accounts ac on ac.user_id = o.user_id
      left join public.connection_notes n on n.owner_attendee = v_me and n.about_attendee = o.id
      left join public.conversations c on c.event_id = r.event_id
            and c.attendee_lo = least(r.from_attendee, r.to_attendee) and c.attendee_hi = greatest(r.from_attendee, r.to_attendee)
     where r.event_id = p_event_id
       and (r.from_attendee = v_me or r.to_attendee = v_me)
       and r.status = 'accepted'
       and o.banned_at is null
       and not private.is_blocked_pair(v_me, o.id)
     order by ac.full_name, o.id;
end;
$$;

revoke all on function public.export_contacts(uuid) from public, anon;
grant execute on function public.export_contacts(uuid) to authenticated;
