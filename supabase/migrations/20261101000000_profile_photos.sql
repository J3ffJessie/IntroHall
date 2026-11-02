-- Optional profile photos (avatars/{user_id}/…, public bucket from the orgs/events migration).
-- The inbox and chat now return the partner's avatar_path, as get_matches already does.

-- accounts.avatar_path is client-writable (column grant); it may only point into the owner's own folder,
-- so nobody can show another person's photo as theirs.
alter table public.accounts add constraint accounts_avatar_path_own_folder
  check (avatar_path is null or (avatar_path like user_id::text || '/%' and avatar_path !~ '\.\.')) not valid;
alter table public.accounts validate constraint accounts_avatar_path_own_folder;

-- Return types change, so drop and recreate (same bodies plus avatar_path).
drop function public.get_connections(uuid);
drop function public.get_conversations(uuid);

-- Everything the inbox and match cards need, from the caller's point of view.
-- Outgoing declined requests are reported as 'pending' (silent decline).
create function public.get_connections(p_event_id uuid)
returns table (
  request_id      uuid,
  direction       text,
  status          text,
  other_attendee  uuid,
  full_name       text,
  headline        text,
  company         text,
  avatar_path     text,
  note            text,
  created_at      timestamptz,
  conversation_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_active_attendee(p_event_id);
begin
  if v_me is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  return query
    select r.id,
           case when r.from_attendee = v_me then 'outgoing' else 'incoming' end,
           case when r.from_attendee = v_me and r.status = 'declined' then 'pending' else r.status end,
           o.id, ac.full_name, ac.headline, ac.company, ac.avatar_path, r.note, r.created_at, c.id
      from public.connection_requests r
      join public.attendees o on o.id = case when r.from_attendee = v_me then r.to_attendee else r.from_attendee end
      join public.accounts ac on ac.user_id = o.user_id
      left join public.conversations c on c.event_id = r.event_id
            and c.attendee_lo = least(r.from_attendee, r.to_attendee) and c.attendee_hi = greatest(r.from_attendee, r.to_attendee)
     where r.event_id = p_event_id
       and (r.from_attendee = v_me or r.to_attendee = v_me)
       and r.status <> 'withdrawn'
       -- Incoming declines are done; nothing to show.
       and not (r.to_attendee = v_me and r.status = 'declined')
       and o.id not in (select private.my_blocked_attendee_ids())
     order by r.created_at desc;
end;
$$;

-- Conversation list with partner, last message and unread count. Partners stay named even if
-- they later hide their profile (§3.3: existing conversations continue).
create function public.get_conversations(p_event_id uuid)
returns table (
  conversation_id  uuid,
  other_attendee   uuid,
  full_name        text,
  headline         text,
  avatar_path      text,
  read_only_reason text,
  last_message     text,
  last_message_at  timestamptz,
  unread           integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid;
begin
  select a.id into v_me from public.attendees a where a.event_id = p_event_id and a.user_id = auth.uid();
  if v_me is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  return query
    select c.id, o.id, coalesce(ac.full_name, 'Deleted user'), coalesce(ac.headline, ''), ac.avatar_path,
           c.read_only_reason,
           (select m.body from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
           c.last_message_at,
           (select count(*)::integer from public.messages m
             where m.conversation_id = c.id and m.created_at > cp.last_read_at
               and m.sender_attendee is distinct from v_me)
      from public.conversation_participants cp
      join public.conversations c on c.id = cp.conversation_id
      left join public.attendees o on o.id = case when c.attendee_lo = v_me then c.attendee_hi else c.attendee_lo end
      left join public.accounts ac on ac.user_id = o.user_id
     where cp.attendee_id = v_me
     order by coalesce(c.last_message_at, c.created_at) desc;
end;
$$;

revoke execute on function public.get_connections(uuid), public.get_conversations(uuid) from public, anon;
grant execute on function public.get_connections(uuid), public.get_conversations(uuid) to authenticated;
