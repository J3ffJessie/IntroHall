-- Phase 4: connection requests, conversations, messages, blocks, reports, realtime (§3, §4.5).

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.connection_requests (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  from_attendee uuid not null references public.attendees (id) on delete cascade,
  to_attendee   uuid not null references public.attendees (id) on delete cascade,
  note          text not null default '' check (char_length(note) <= 280),
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  check (from_attendee <> to_attendee)
);
-- One request per unordered pair per event.
create unique index connection_requests_pair_idx on public.connection_requests
  (event_id, least(from_attendee, to_attendee), greatest(from_attendee, to_attendee));
create index connection_requests_to_idx on public.connection_requests (to_attendee) where status = 'pending';
create index connection_requests_from_idx on public.connection_requests (from_attendee) where status = 'pending';

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  -- SET NULL keeps the conversation (shown as "Deleted user") after account deletion.
  attendee_lo      uuid references public.attendees (id) on delete set null,
  attendee_hi      uuid references public.attendees (id) on delete set null,
  read_only_reason text check (read_only_reason in ('blocked', 'left', 'event_closed')),
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz,
  check (attendee_lo < attendee_hi),
  unique (event_id, attendee_lo, attendee_hi)
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  attendee_id     uuid not null references public.attendees (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  last_seen_at    timestamptz,
  last_push_at    timestamptz,
  primary key (conversation_id, attendee_id)
);
create index conversation_participants_attendee_idx on public.conversation_participants (attendee_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_attendee uuid references public.attendees (id) on delete set null,
  client_msg_id   uuid not null,
  body            text not null check (char_length(body) between 1 and 2000),
  created_at      timestamptz not null default now(),
  unique (sender_attendee, client_msg_id)
);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_created_idx on public.messages (sender_attendee, created_at);

create table public.blocks (
  blocker_attendee uuid not null references public.attendees (id) on delete cascade,
  blocked_attendee uuid not null references public.attendees (id) on delete cascade,
  event_id         uuid not null references public.events (id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (blocker_attendee, blocked_attendee),
  check (blocker_attendee <> blocked_attendee)
);
create index blocks_blocked_idx on public.blocks (blocked_attendee);

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  reporter        uuid references public.attendees (id) on delete set null,
  target_attendee uuid references public.attendees (id) on delete set null,
  message_id      uuid references public.messages (id) on delete set null,
  -- Evidence survives message retention and account deletion.
  message_snapshot text,
  sender_snapshot  jsonb not null default '{}'::jsonb,
  reason          text not null check (char_length(btrim(reason)) between 1 and 1000),
  status          text not null default 'open' check (status in ('open', 'resolved')),
  reported_at     timestamptz not null default now(),
  resolved_by     uuid references public.accounts (user_id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text not null default '' check (char_length(resolution_note) <= 1000)
);
create index reports_event_status_idx on public.reports (event_id, status, reported_at desc);
create index reports_message_open_idx on public.reports (message_id) where status = 'open';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Attendees blocked by me or blocking me (both directions hide), across all my attendee rows.
create function private.my_blocked_attendee_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_attendee from public.blocks b
   where b.blocker_attendee in (select a.id from public.attendees a where a.user_id = auth.uid())
  union
  select b.blocker_attendee from public.blocks b
   where b.blocked_attendee in (select a.id from public.attendees a where a.user_id = auth.uid());
$$;

create function private.my_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cp.conversation_id
    from public.conversation_participants cp
    join public.attendees a on a.id = cp.attendee_id
   where a.user_id = auth.uid();
$$;

-- The caller's active (completed, not left, not banned) attendee row for an event, or null.
create function private.my_active_attendee(p_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from public.attendees a
   where a.event_id = p_event_id and a.user_id = auth.uid()
     and a.completed_at is not null and a.left_at is null and a.banned_at is null;
$$;

create function private.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.blocks b
                  where (b.blocker_attendee = p_a and b.blocked_attendee = p_b)
                     or (b.blocker_attendee = p_b and b.blocked_attendee = p_a));
$$;

create function private.user_of(p_attendee_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id from public.attendees a where a.id = p_attendee_id;
$$;

-- Private broadcast to one user's topic (R7). Only triggers/RPCs call this; clients cannot insert.
create function private.notify_user(p_user_id uuid, p_event text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  select realtime.send(p_payload, p_event, 'user:' || p_user_id::text, true) where p_user_id is not null;
$$;

-- ---------------------------------------------------------------------------
-- Blocks hide both directions in R3 and matching
-- ---------------------------------------------------------------------------
drop policy attendees_select_coattendee on public.attendees;
create policy attendees_select_coattendee on public.attendees
  for select to authenticated
  using (event_id in (select private.my_event_ids())
         and visibility = 'visible'
         and completed_at is not null
         and left_at is null
         and banned_at is null
         and id not in (select private.my_blocked_attendee_ids()));

-- ---------------------------------------------------------------------------
-- Grants and RLS (R5, R6)
-- ---------------------------------------------------------------------------
alter table public.connection_requests       enable row level security;
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.blocks                    enable row level security;
alter table public.reports                   enable row level security;

revoke all on public.connection_requests, public.conversations, public.conversation_participants,
              public.messages, public.blocks, public.reports
  from public, anon, authenticated;

-- connection_requests: no direct access. get_connections() masks declines for the sender
-- ("decline is silent", §3.2), which a row policy cannot do.

grant select on public.conversations to authenticated;
create policy conversations_select_participant on public.conversations
  for select to authenticated using (id in (select private.my_conversation_ids()));

grant select on public.conversation_participants to authenticated;
create policy conversation_participants_select on public.conversation_participants
  for select to authenticated using (conversation_id in (select private.my_conversation_ids()));

-- Organizers never read messages (R6); they see reports.message_snapshot.
grant select on public.messages to authenticated;
create policy messages_select_participant on public.messages
  for select to authenticated using (conversation_id in (select private.my_conversation_ids()));

grant select on public.blocks to authenticated;
create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_attendee in (select a.id from public.attendees a where a.user_id = (select auth.uid())));

grant select on public.reports to authenticated;
create policy reports_select_org on public.reports
  for select to authenticated using (event_id in (select private.my_org_event_ids()));
create policy reports_select_reporter on public.reports
  for select to authenticated
  using (reporter in (select a.id from public.attendees a where a.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Realtime (R7): every channel private; SELECT (subscribe) policies only; no INSERT policy,
-- so only database triggers broadcast and clients cannot spoof messages or announcements.
-- ---------------------------------------------------------------------------
create policy realtime_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      realtime.topic() = 'user:' || (select auth.uid())::text
      or realtime.topic() in (select 'event:' || e::text from private.my_event_ids() e)
      or realtime.topic() in (select 'event:' || e::text from private.my_org_event_ids() e)
      or realtime.topic() in (select 'moderation:' || e::text from private.my_org_event_ids() e)
    )
  );

-- ---------------------------------------------------------------------------
-- Broadcast triggers (§4.5)
-- ---------------------------------------------------------------------------
create function private.messages_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := jsonb_build_object(
    'id', new.id, 'conversation_id', new.conversation_id, 'sender_attendee', new.sender_attendee,
    'client_msg_id', new.client_msg_id, 'body', new.body, 'created_at', new.created_at);
  v_user uuid;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  -- Both participants (the sender's other devices need it too): 2 sends.
  for v_user in
    select a.user_id from public.conversation_participants cp
      join public.attendees a on a.id = cp.attendee_id
     where cp.conversation_id = new.conversation_id
  loop
    perform private.notify_user(v_user, 'message', v_payload);
  end loop;
  return null;
end;
$$;

create trigger messages_broadcast
  after insert on public.messages
  for each row execute function private.messages_broadcast();

create function private.connection_requests_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := jsonb_build_object('id', new.id, 'event_id', new.event_id);
begin
  if tg_op = 'INSERT' or (new.status = 'pending' and old.status is distinct from 'pending') then
    perform private.notify_user(private.user_of(new.to_attendee), 'request', v_payload || '{"status":"pending"}');
  elsif new.status = 'accepted' and old.status = 'pending' then
    perform private.notify_user(private.user_of(new.to_attendee), 'request', v_payload || '{"status":"accepted"}');
    perform private.notify_user(private.user_of(new.from_attendee), 'request', v_payload || '{"status":"accepted"}');
  elsif new.status in ('withdrawn', 'declined') and old.status = 'pending' then
    -- Declines are silent to the sender: only the recipient's own views refresh.
    perform private.notify_user(private.user_of(new.to_attendee), 'request', v_payload || jsonb_build_object('status', new.status));
  end if;
  return null;
end;
$$;

create trigger connection_requests_broadcast
  after insert or update of status on public.connection_requests
  for each row execute function private.connection_requests_broadcast();

create function private.conversation_participants_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_user(private.user_of(new.attendee_id), 'conversation',
                              jsonb_build_object('conversation_id', new.conversation_id));
  return null;
end;
$$;

create trigger conversation_participants_broadcast
  after insert on public.conversation_participants
  for each row execute function private.conversation_participants_broadcast();

create function private.reports_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id), 'report', 'moderation:' || new.event_id::text, true);
  return null;
end;
$$;

create trigger reports_broadcast
  after insert on public.reports
  for each row execute function private.reports_broadcast();

-- ---------------------------------------------------------------------------
-- Lifecycle (§3.3): leaving / removal withdraws pending requests and freezes conversations;
-- rejoining reopens conversations frozen only because of leaving.
-- ---------------------------------------------------------------------------
create function private.attendees_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.left_at is not null and old.left_at is null then
    update public.connection_requests set status = 'withdrawn', responded_at = now()
     where status = 'pending' and (from_attendee = new.id or to_attendee = new.id);
    update public.conversations set read_only_reason = 'left'
     where read_only_reason is null and (attendee_lo = new.id or attendee_hi = new.id);
  elsif new.left_at is null and old.left_at is not null then
    update public.conversations c set read_only_reason = null
     where c.read_only_reason = 'left' and (c.attendee_lo = new.id or c.attendee_hi = new.id)
       and not exists (select 1 from public.attendees o
                        where o.id in (c.attendee_lo, c.attendee_hi) and o.id <> new.id and o.left_at is not null)
       and not private.is_blocked_pair(c.attendee_lo, c.attendee_hi);
  end if;
  return null;
end;
$$;

create trigger attendees_lifecycle
  after update of left_at on public.attendees
  for each row execute function private.attendees_lifecycle();

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER; each checks the caller first)
-- ---------------------------------------------------------------------------

-- Returns 'sent' | 'already_pending' | 'connected' (they had already asked me: auto-accepted).
create function public.send_request(p_to_attendee uuid, p_note text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.attendees;
  v_me     uuid;
  v_req    public.connection_requests;
begin
  select * into v_target from public.attendees a where a.id = p_to_attendee;
  v_me := private.my_active_attendee(v_target.event_id);
  if v_target.id is null or v_me is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  if v_target.id = v_me then
    raise exception 'you cannot connect with yourself' using errcode = 'P0001';
  end if;
  if v_target.completed_at is null or v_target.visibility <> 'visible' or v_target.left_at is not null
     or v_target.banned_at is not null or private.is_blocked_pair(v_me, v_target.id) then
    raise exception 'this attendee is not available' using errcode = 'P0001';
  end if;
  if (select e.status from public.events e where e.id = v_target.event_id) <> 'published' then
    raise exception 'this event is not open for new connections' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) > 280 then
    raise exception 'notes are at most 280 characters' using errcode = 'P0001';
  end if;

  select * into v_req from public.connection_requests r
   where r.event_id = v_target.event_id
     and least(r.from_attendee, r.to_attendee) = least(v_me, v_target.id)
     and greatest(r.from_attendee, r.to_attendee) = greatest(v_me, v_target.id)
   for update;

  if v_req.id is not null then
    if v_req.status = 'accepted' then
      return 'connected';
    elsif v_req.status = 'pending' and v_req.to_attendee = v_me then
      perform public.respond_request(v_req.id, true);
      return 'connected';
    elsif v_req.from_attendee = v_me and v_req.status in ('pending', 'declined') then
      -- Declined looks pending to the sender (silent decline).
      return 'already_pending';
    elsif v_req.to_attendee = v_me and v_req.status = 'declined' then
      -- I had declined them; now I'm asking: treat as a fresh request in my direction.
      null;
    end if;
  end if;

  if (select count(*) from public.connection_requests r where r.from_attendee = v_me and r.status = 'pending') >= 20 then
    raise exception 'you have 20 pending requests; wait for replies or withdraw some' using errcode = 'P0001';
  end if;

  if v_req.id is not null then
    update public.connection_requests
       set from_attendee = v_me, to_attendee = v_target.id, note = btrim(coalesce(p_note, '')),
           status = 'pending', created_at = now(), responded_at = null
     where id = v_req.id;
  else
    insert into public.connection_requests (event_id, from_attendee, to_attendee, note)
    values (v_target.event_id, v_me, v_target.id, btrim(coalesce(p_note, '')));
  end if;
  return 'sent';
end;
$$;

-- Atomic accept: request + conversation + both participants. Returns the conversation id on accept.
create function public.respond_request(p_request_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req  public.connection_requests;
  v_conv uuid;
begin
  select * into v_req from public.connection_requests r where r.id = p_request_id for update;
  if v_req.id is null or v_req.to_attendee is distinct from private.my_active_attendee(v_req.event_id) then
    raise exception 'request not found' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'this request is no longer pending' using errcode = 'P0001';
  end if;

  if not p_accept then
    update public.connection_requests set status = 'declined', responded_at = now() where id = v_req.id;
    return null;
  end if;

  if private.is_blocked_pair(v_req.from_attendee, v_req.to_attendee)
     or exists (select 1 from public.attendees a where a.id = v_req.from_attendee
                 and (a.left_at is not null or a.banned_at is not null)) then
    raise exception 'this attendee is not available' using errcode = 'P0001';
  end if;

  update public.connection_requests set status = 'accepted', responded_at = now() where id = v_req.id;
  insert into public.conversations (event_id, attendee_lo, attendee_hi)
  values (v_req.event_id, least(v_req.from_attendee, v_req.to_attendee), greatest(v_req.from_attendee, v_req.to_attendee))
  on conflict (event_id, attendee_lo, attendee_hi) do update set read_only_reason = null
  returning id into v_conv;
  insert into public.conversation_participants (conversation_id, attendee_id)
  values (v_conv, v_req.from_attendee), (v_conv, v_req.to_attendee)
  on conflict do nothing;
  return v_conv;
end;
$$;

create function public.withdraw_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connection_requests r set status = 'withdrawn', responded_at = now()
   where r.id = p_request_id and r.status in ('pending', 'declined')
     and r.from_attendee in (select a.id from public.attendees a where a.user_id = auth.uid());
  if not found then
    raise exception 'request not found' using errcode = '42501';
  end if;
end;
$$;

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
           o.id, ac.full_name, ac.headline, ac.company, r.note, r.created_at, c.id
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
    select c.id, o.id, coalesce(ac.full_name, 'Deleted user'), coalesce(ac.headline, ''), c.read_only_reason,
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

-- Idempotent on (sender, client_msg_id): a retried send returns the original row (§4.5 outbox).
create function public.send_message(p_conversation_id uuid, p_client_msg_id uuid, p_body text)
returns setof public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
  v_me   uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_row  public.messages;
begin
  select * into v_conv from public.conversations c where c.id = p_conversation_id;
  v_me := private.my_active_attendee(v_conv.event_id);
  if v_conv.id is null or v_me is null
     or not exists (select 1 from public.conversation_participants cp
                     where cp.conversation_id = v_conv.id and cp.attendee_id = v_me) then
    raise exception 'conversation not found' using errcode = '42501';
  end if;

  -- A retry of an already-stored message succeeds even if limits or read-only state changed since.
  select * into v_row from public.messages m where m.sender_attendee = v_me and m.client_msg_id = p_client_msg_id;
  if v_row.id is not null then
    return next v_row;
    return;
  end if;

  if v_conv.read_only_reason is not null then
    raise exception 'this conversation is read-only' using errcode = 'P0001';
  end if;
  if (select e.status from public.events e where e.id = v_conv.event_id) <> 'published' then
    raise exception 'this event has ended' using errcode = 'P0001';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'messages are 1–2000 characters' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages m
       where m.sender_attendee = v_me and m.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'you are sending messages too quickly; wait a moment' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender_attendee, client_msg_id, body)
  values (v_conv.id, v_me, p_client_msg_id, v_body)
  on conflict (sender_attendee, client_msg_id) do nothing
  returning * into v_row;
  if v_row.id is null then
    -- Lost a race with a concurrent retry of the same message.
    select * into v_row from public.messages m where m.sender_attendee = v_me and m.client_msg_id = p_client_msg_id;
  end if;
  update public.conversation_participants set last_read_at = now(), last_seen_at = now()
   where conversation_id = v_conv.id and attendee_id = v_me;
  return next v_row;
end;
$$;

-- 30 s heartbeat while a conversation is focused: marks it read and records presence (§4.5).
create function public.touch_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_participants cp
     set last_seen_at = now(), last_read_at = now()
   where cp.conversation_id = p_conversation_id
     and cp.attendee_id in (select a.id from public.attendees a where a.user_id = auth.uid());
end;
$$;

-- Block hides both directions, freezes the conversation and clears pending requests.
create function public.block_attendee(p_attendee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.attendees;
  v_me     uuid;
begin
  select * into v_target from public.attendees a where a.id = p_attendee_id;
  select a.id into v_me from public.attendees a where a.event_id = v_target.event_id and a.user_id = auth.uid();
  if v_target.id is null or v_me is null or v_me = v_target.id then
    raise exception 'attendee not found' using errcode = '42501';
  end if;
  insert into public.blocks (blocker_attendee, blocked_attendee, event_id)
  values (v_me, v_target.id, v_target.event_id)
  on conflict do nothing;
  update public.conversations set read_only_reason = 'blocked'
   where event_id = v_target.event_id
     and attendee_lo = least(v_me, v_target.id) and attendee_hi = greatest(v_me, v_target.id);
  update public.connection_requests set status = 'withdrawn', responded_at = now()
   where event_id = v_target.event_id and status = 'pending'
     and least(from_attendee, to_attendee) = least(v_me, v_target.id)
     and greatest(from_attendee, to_attendee) = greatest(v_me, v_target.id);
  perform private.mark_stats_dirty(v_target.event_id);
end;
$$;

-- Copies the evidence (message body + sender identity) so it survives retention and deletion.
create function public.report_attendee(p_attendee_id uuid, p_reason text, p_message_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.attendees;
  v_me     uuid;
  v_msg    public.messages;
  v_id     uuid;
begin
  select * into v_target from public.attendees a where a.id = p_attendee_id;
  select a.id into v_me from public.attendees a where a.event_id = v_target.event_id and a.user_id = auth.uid();
  if v_target.id is null or v_me is null or v_me = v_target.id then
    raise exception 'attendee not found' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then
    raise exception 'please describe the problem (up to 1000 characters)' using errcode = 'P0001';
  end if;
  if (select count(*) from public.reports r where r.reporter = v_me and r.reported_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many reports; please contact the organizer directly' using errcode = 'P0001';
  end if;
  if p_message_id is not null then
    -- Only messages the target sent in a conversation the reporter is part of.
    select m.* into v_msg from public.messages m
      join public.conversation_participants cp on cp.conversation_id = m.conversation_id and cp.attendee_id = v_me
     where m.id = p_message_id and m.sender_attendee = v_target.id;
    if v_msg.id is null then
      raise exception 'message not found' using errcode = '42501';
    end if;
  end if;

  insert into public.reports (event_id, reporter, target_attendee, message_id, message_snapshot, sender_snapshot, reason)
  select v_target.event_id, v_me, v_target.id, v_msg.id, v_msg.body,
         jsonb_build_object('attendee_id', v_target.id, 'full_name', ac.full_name, 'headline', ac.headline,
                            'company', ac.company, 'bio', v_target.bio),
         btrim(p_reason)
    from public.accounts ac where ac.user_id = v_target.user_id
  returning id into v_id;
  return v_id;
end;
$$;

create function public.resolve_report(p_report_id uuid, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reports r
     set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
         resolution_note = left(btrim(coalesce(p_note, '')), 1000)
   where r.id = p_report_id and r.status = 'open'
     and r.event_id in (select private.my_org_event_ids());
  if not found then
    raise exception 'report not found or already resolved' using errcode = '42501';
  end if;
end;
$$;

-- Organizer moderation queue: reports with reporter and target names (not message threads).
create function public.get_reports(p_event_id uuid)
returns table (
  report_id        uuid,
  status           text,
  reason           text,
  reported_at      timestamptz,
  reporter_name    text,
  target_attendee  uuid,
  target_name      text,
  target_banned    boolean,
  target_left      boolean,
  message_snapshot text,
  sender_snapshot  jsonb,
  resolved_at      timestamptz,
  resolution_note  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_event_id not in (select private.my_org_event_ids()) then
    raise exception 'event not found' using errcode = '42501';
  end if;
  return query
    select r.id, r.status, r.reason, r.reported_at, coalesce(rac.full_name, 'Deleted user'), r.target_attendee,
           coalesce(tac.full_name, r.sender_snapshot ->> 'full_name', 'Deleted user'),
           ta.banned_at is not null, ta.left_at is not null,
           r.message_snapshot, r.sender_snapshot, r.resolved_at, r.resolution_note
      from public.reports r
      left join public.attendees ra on ra.id = r.reporter
      left join public.accounts rac on rac.user_id = ra.user_id
      left join public.attendees ta on ta.id = r.target_attendee
      left join public.accounts tac on tac.user_id = ta.user_id
     where r.event_id = p_event_id
     order by (r.status = 'open') desc, r.reported_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Matching excludes blocked pairs (replaces the Phase 3 placeholder comment's filter)
-- ---------------------------------------------------------------------------
create or replace function public.get_matches(
  p_event_id uuid,
  p_mode     text default 'matches',
  p_tag      uuid default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns table (
  attendee_id  uuid,
  full_name    text,
  headline     text,
  company      text,
  avatar_path  text,
  bio          text,
  looking_for  text,
  shared_tags  text[],
  score        double precision,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me      uuid;
  v_n       double precision;
  v_limit   integer := least(greatest(p_limit, 1), 100);
  v_offset  integer := greatest(p_offset, 0);
  v_blocked uuid[];
begin
  if p_mode not in ('matches', 'everyone') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  v_me := private.my_active_attendee(p_event_id);
  if v_me is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  v_n := greatest(coalesce((select s.n from public.event_stats s where s.event_id = p_event_id), 1), 1);
  v_blocked := coalesce((select array_agg(b) from private.my_blocked_attendee_ids() b), '{}');

  -- Performance: score with tag ids only, rank, and only then fetch names and labels for the
  -- page being returned. Eligibility always comes from live tables.
  if p_mode = 'matches' then
    return query
    with weights as (
      select mi.tag_id, ln(1 + v_n / coalesce(st.count, 1)::double precision) as w
        from public.attendee_interests mi
        left join public.event_tag_stats st on st.event_id = p_event_id and st.tag_id = mi.tag_id
       where mi.attendee_id = v_me
    ),
    scores as (
      select x.attendee_id as id, sum(w.w) as score
        from public.attendee_interests x
        join weights w on w.tag_id = x.tag_id
       where x.attendee_id <> v_me
       group by x.attendee_id
    ),
    page as (
      select a.id, a.user_id, a.bio, a.looking_for, a.completed_at, s.score
        from scores s
        join public.attendees a on a.id = s.id
       where a.completed_at is not null and a.visibility = 'visible' and a.left_at is null and a.banned_at is null
         and a.id <> all(v_blocked)
         and (p_tag is null or exists (select 1 from public.attendee_interests f
                                        where f.attendee_id = a.id and f.tag_id = p_tag))
       order by s.score desc, a.completed_at desc, a.id
       limit v_limit offset v_offset
    )
    select p.id, ac.full_name, ac.headline, ac.company, ac.avatar_path, p.bio, p.looking_for,
           (select array_agg(t.label order by t.label)
              from public.attendee_interests y
              join weights w on w.tag_id = y.tag_id
              join public.interest_tags t on t.id = y.tag_id
             where y.attendee_id = p.id),
           p.score, p.completed_at
      from page p
      join public.accounts ac on ac.user_id = p.user_id
     order by p.score desc, p.completed_at desc, p.id;
  else
    return query
    with page as (
      select a.id, a.user_id, a.bio, a.looking_for, a.completed_at
        from public.attendees a
       where a.event_id = p_event_id and a.id <> v_me
         and a.completed_at is not null and a.visibility = 'visible' and a.left_at is null and a.banned_at is null
         and a.id <> all(v_blocked)
         and not exists (select 1 from public.attendee_interests x
                          join public.attendee_interests mi on mi.tag_id = x.tag_id and mi.attendee_id = v_me
                         where x.attendee_id = a.id)
         and (p_tag is null or exists (select 1 from public.attendee_interests f
                                        where f.attendee_id = a.id and f.tag_id = p_tag))
       order by a.completed_at desc, a.id
       limit v_limit offset v_offset
    )
    select p.id, ac.full_name, ac.headline, ac.company, ac.avatar_path, p.bio, p.looking_for,
           '{}'::text[], 0::double precision, p.completed_at
      from page p
      join public.accounts ac on ac.user_id = p.user_id
     order by p.completed_at desc, p.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention (§3.3): delete messages of events past ends_at + retention_days, except messages
-- referenced by open reports. Daily.
-- ---------------------------------------------------------------------------
create function private.purge_expired_messages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.messages m
   using public.conversations c, public.events e
   where c.id = m.conversation_id and e.id = c.event_id
     and now() > e.ends_at + make_interval(days => e.retention_days)
     and not exists (select 1 from public.reports r where r.message_id = m.id and r.status = 'open');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

select cron.schedule('purge-expired-messages', '17 3 * * *', $$select private.purge_expired_messages()$$);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.send_request(uuid, text), public.respond_request(uuid, boolean), public.withdraw_request(uuid),
  public.get_connections(uuid), public.get_conversations(uuid), public.send_message(uuid, uuid, text),
  public.touch_conversation(uuid), public.block_attendee(uuid), public.report_attendee(uuid, text, uuid),
  public.resolve_report(uuid, text), public.get_reports(uuid)
  from public, anon;
grant execute on function
  public.send_request(uuid, text), public.respond_request(uuid, boolean), public.withdraw_request(uuid),
  public.get_connections(uuid), public.get_conversations(uuid), public.send_message(uuid, uuid, text),
  public.touch_conversation(uuid), public.block_attendee(uuid), public.report_attendee(uuid, text, uuid),
  public.resolve_report(uuid, text), public.get_reports(uuid)
  to authenticated;

revoke execute on function
  private.my_blocked_attendee_ids(), private.my_conversation_ids(), private.my_active_attendee(uuid),
  private.is_blocked_pair(uuid, uuid), private.user_of(uuid), private.notify_user(uuid, text, jsonb),
  private.messages_broadcast(), private.connection_requests_broadcast(), private.conversation_participants_broadcast(),
  private.reports_broadcast(), private.attendees_lifecycle(), private.purge_expired_messages()
  from public, anon, authenticated;
-- Used inside authenticated RLS policies.
grant execute on function private.my_blocked_attendee_ids(), private.my_conversation_ids() to authenticated;
