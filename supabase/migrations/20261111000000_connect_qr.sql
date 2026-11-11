-- Tap-to-connect: each attendee has a personal QR code. Scanning it and confirming connects the two
-- people at once (showing your code is the consent the request gate otherwise asks for).

set lock_timeout = '5s';
set statement_timeout = '60s';

-- Secret per attendee; the QR encodes https://{slug}.<host>/c/{token}. Rotating it voids old codes.
-- No API grants: read and written only by the RPCs below.
create table public.connect_tokens (
  attendee_id uuid primary key references public.attendees (id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);
alter table public.connect_tokens enable row level security;
revoke all on public.connect_tokens from anon, authenticated;

-- How a request row came to be accepted: a normal request, or a scanned code.
alter table public.connection_requests
  add column via text not null default 'request' check (via in ('request', 'qr'));

create function private.new_connect_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
$$;

-- The caller's token for an event (created on first use). p_rotate replaces it.
create function public.get_connect_token(p_event_id uuid, p_rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := private.my_active_attendee(p_event_id);
  v_token text;
begin
  if v_me is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  if p_rotate then
    insert into public.connect_tokens (attendee_id, token) values (v_me, private.new_connect_token())
    on conflict (attendee_id) do update set token = excluded.token, created_at = now()
    returning token into v_token;
  else
    insert into public.connect_tokens (attendee_id, token) values (v_me, private.new_connect_token())
    on conflict (attendee_id) do nothing;
    select t.token into v_token from public.connect_tokens t where t.attendee_id = v_me;
  end if;
  return v_token;
end;
$$;

-- Who a scanned code belongs to, for the confirm screen. Only for active attendees of the same event.
-- state: 'self' | 'connected' | 'available' | 'unavailable' (left, banned, blocked, event closed).
create function public.preview_connect_token(p_token text)
returns table (attendee_id uuid, event_id uuid, full_name text, headline text, company text, avatar_path text,
               state text, conversation_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner public.attendees;
  v_me    uuid;
  v_conv  uuid;
begin
  select a.* into v_owner from public.connect_tokens t join public.attendees a on a.id = t.attendee_id
   where t.token = p_token;
  v_me := private.my_active_attendee(v_owner.event_id);
  if v_owner.id is null or v_me is null then
    return;  -- unknown code, or the caller isn't (yet) at this event
  end if;

  select c.id into v_conv from public.conversations c
   where c.event_id = v_owner.event_id
     and c.attendee_lo = least(v_me, v_owner.id) and c.attendee_hi = greatest(v_me, v_owner.id)
     and exists (select 1 from public.connection_requests r
                  where r.event_id = c.event_id and r.status = 'accepted'
                    and least(r.from_attendee, r.to_attendee) = c.attendee_lo
                    and greatest(r.from_attendee, r.to_attendee) = c.attendee_hi);

  return query
  select v_owner.id, v_owner.event_id, ac.full_name, ac.headline, ac.company, ac.avatar_path,
         case
           when v_owner.id = v_me then 'self'
           when v_conv is not null then 'connected'
           when v_owner.completed_at is null or v_owner.left_at is not null or v_owner.banned_at is not null
             or private.is_blocked_pair(v_me, v_owner.id)
             or (select e.status from public.events e where e.id = v_owner.event_id) <> 'published' then 'unavailable'
           else 'available'
         end,
         v_conv
    from public.accounts ac where ac.user_id = v_owner.user_id;
end;
$$;

-- Connects the caller with the code's owner. Returns the conversation id.
create function public.connect_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner public.attendees;
  v_me    uuid;
  v_req   public.connection_requests;
  v_conv  uuid;
begin
  select a.* into v_owner from public.connect_tokens t join public.attendees a on a.id = t.attendee_id
   where t.token = p_token;
  v_me := private.my_active_attendee(v_owner.event_id);
  if v_owner.id is null or v_me is null then
    raise exception 'this code is not valid for you' using errcode = '42501';
  end if;
  if v_owner.id = v_me then
    raise exception 'you cannot connect with yourself' using errcode = 'P0001';
  end if;
  -- Hidden profiles may still share their code: visibility only governs matching.
  if v_owner.completed_at is null or v_owner.left_at is not null or v_owner.banned_at is not null
     or private.is_blocked_pair(v_me, v_owner.id) then
    raise exception 'this attendee is not available' using errcode = 'P0001';
  end if;
  if (select e.status from public.events e where e.id = v_owner.event_id) <> 'published' then
    raise exception 'this event is not open for new connections' using errcode = 'P0001';
  end if;

  select * into v_req from public.connection_requests r
   where r.event_id = v_owner.event_id
     and least(r.from_attendee, r.to_attendee) = least(v_me, v_owner.id)
     and greatest(r.from_attendee, r.to_attendee) = greatest(v_me, v_owner.id)
   for update;

  if v_req.id is null then
    insert into public.connection_requests (event_id, from_attendee, to_attendee, status, responded_at, via)
    values (v_owner.event_id, v_me, v_owner.id, 'accepted', now(), 'qr');
  elsif v_req.status <> 'accepted' then
    -- Scanner → owner, so the owner is the one told "X connected with you".
    update public.connection_requests
       set from_attendee = v_me, to_attendee = v_owner.id, status = 'accepted', responded_at = now(), via = 'qr'
     where id = v_req.id;
  end if;

  insert into public.conversations (event_id, attendee_lo, attendee_hi)
  values (v_owner.event_id, least(v_me, v_owner.id), greatest(v_me, v_owner.id))
  on conflict (event_id, attendee_lo, attendee_hi) do update set read_only_reason = null
  returning id into v_conv;
  insert into public.conversation_participants (conversation_id, attendee_id)
  values (v_conv, v_me), (v_conv, v_owner.id)
  on conflict do nothing;
  return v_conv;
end;
$$;

revoke all on function public.get_connect_token(uuid, boolean), public.preview_connect_token(text),
                       public.connect_by_token(text), private.new_connect_token() from public, anon;
grant execute on function public.get_connect_token(uuid, boolean), public.preview_connect_token(text),
                          public.connect_by_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications: a QR connect (insert or update straight to accepted) tells both sides in realtime
-- and pushes the code's owner.
-- ---------------------------------------------------------------------------
create or replace function private.connection_requests_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := jsonb_build_object('id', new.id, 'event_id', new.event_id);
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status <> 'accepted') then
    perform private.notify_user(private.user_of(new.to_attendee), 'request', v_payload || '{"status":"accepted"}');
    perform private.notify_user(private.user_of(new.from_attendee), 'request', v_payload || '{"status":"accepted"}');
  elsif new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    perform private.notify_user(private.user_of(new.to_attendee), 'request', v_payload || '{"status":"pending"}');
  elsif tg_op = 'UPDATE' and new.status in ('withdrawn', 'declined') and old.status = 'pending' then
    -- Declines are silent to the sender: only the recipient's own views refresh.
    perform private.notify_user(private.user_of(new.to_attendee), 'request', v_payload || jsonb_build_object('status', new.status));
  end if;
  return null;
end;
$$;

create or replace function private.connection_requests_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_name text;
  v_to_name   text;
begin
  select ac.full_name into v_from_name from public.attendees a join public.accounts ac on ac.user_id = a.user_id where a.id = new.from_attendee;
  select ac.full_name into v_to_name from public.attendees a join public.accounts ac on ac.user_id = a.user_id where a.id = new.to_attendee;
  if new.status = 'accepted' and new.via = 'qr' and (tg_op = 'INSERT' or old.status <> 'accepted') then
    perform private.enqueue_push('accepted', new.event_id, private.user_of(new.to_attendee),
      coalesce(v_from_name, 'Someone') || ' connected with you', 'They scanned your code. Say hello!', '/inbox',
      'accepted-' || new.id);
  elsif new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    perform private.enqueue_push('request', new.event_id, private.user_of(new.to_attendee),
      coalesce(v_from_name, 'Someone') || ' wants to connect', nullif(new.note, ''), '/inbox', 'request-' || new.id);
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    perform private.enqueue_push('accepted', new.event_id, private.user_of(new.from_attendee),
      coalesce(v_to_name, 'Someone') || ' accepted your request', 'Say hello!', '/inbox', 'accepted-' || new.id);
  end if;
  return null;
end;
$$;
