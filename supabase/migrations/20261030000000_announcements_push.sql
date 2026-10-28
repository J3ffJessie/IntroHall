-- Phase 5: announcements and web push (§4.6).

set lock_timeout = '5s';
set statement_timeout = '60s';

create extension if not exists pgmq;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table public.announcements (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  author_user      uuid references public.accounts (user_id) on delete set null,
  title            text not null check (char_length(btrim(title)) between 1 and 120),
  body             text not null default '' check (char_length(body) <= 2000),
  pinned           boolean not null default false,
  -- Null = publish immediately (via publish_announcement); otherwise the cron claims it at this time.
  publish_at       timestamptz,
  published_at     timestamptz,
  push_enqueued_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index announcements_event_published_idx on public.announcements (event_id, published_at desc);
create index announcements_scheduled_idx on public.announcements (publish_at) where published_at is null;

create trigger announcements_touch_updated_at
  before update on public.announcements
  for each row execute function private.touch_updated_at();

alter table public.announcements enable row level security;
revoke all on public.announcements from public, anon, authenticated;

-- R2: published announcements of publicly visible events (the subquery runs under events' RLS).
grant select on public.announcements to anon, authenticated;
create policy announcements_select_published on public.announcements
  for select to anon, authenticated
  using (published_at is not null and event_id in (select id from public.events));
-- R1: organizers see drafts and scheduled posts and manage them.
create policy announcements_select_org on public.announcements
  for select to authenticated using (event_id in (select private.my_org_event_ids()));

grant insert (event_id, title, body, pinned, publish_at) on public.announcements to authenticated;
grant update (title, body, pinned, publish_at) on public.announcements to authenticated;
grant delete on public.announcements to authenticated;
create policy announcements_insert_org on public.announcements
  for insert to authenticated with check (event_id in (select private.my_org_event_ids()));
create policy announcements_update_org on public.announcements
  for update to authenticated
  using (event_id in (select private.my_org_event_ids()))
  with check (event_id in (select private.my_org_event_ids()));
create policy announcements_delete_org on public.announcements
  for delete to authenticated using (event_id in (select private.my_org_event_ids()));

create function private.announcements_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.author_user := auth.uid();
  end if;
  return new;
end;
$$;

create trigger announcements_defaults
  before insert on public.announcements
  for each row execute function private.announcements_defaults();

-- ---------------------------------------------------------------------------
-- Push subscriptions (one per browser/device; linked to the events it was enabled on,
-- because a subscription belongs to one origin = one event subdomain)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.accounts (user_id) on delete cascade,
  endpoint        text not null unique check (endpoint ~ '^https?://' and char_length(endpoint) <= 1000),
  p256dh          text not null check (char_length(p256dh) <= 200),
  auth            text not null check (char_length(auth) <= 100),
  user_agent      text not null default '' check (char_length(user_agent) <= 300),
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.push_subscription_events (
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  event_id        uuid not null references public.events (id) on delete cascade,
  primary key (subscription_id, event_id)
);
create index push_subscription_events_event_idx on public.push_subscription_events (event_id, subscription_id);

alter table public.push_subscriptions enable row level security;
alter table public.push_subscription_events enable row level security;
revoke all on public.push_subscriptions, public.push_subscription_events from public, anon, authenticated;
grant select on public.push_subscriptions, public.push_subscription_events to authenticated;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscription_events_select_own on public.push_subscription_events
  for select to authenticated
  using (subscription_id in (select s.id from public.push_subscriptions s where s.user_id = (select auth.uid())));

-- Upserts this device's subscription for the caller and links it to an event they attend.
-- A device that switches accounts moves its subscription to the new account.
create function public.save_push_subscription(p_event_id uuid, p_endpoint text, p_p256dh text, p_auth text,
                                              p_user_agent text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid;
begin
  if private.my_active_attendee(p_event_id) is null then
    raise exception 'not an attendee of this event' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
  returning id into v_sub;
  -- If the device moved accounts, its old event links belonged to someone else.
  delete from public.push_subscription_events pse
   where pse.subscription_id = v_sub
     and pse.event_id not in (select a.event_id from public.attendees a where a.user_id = auth.uid());
  insert into public.push_subscription_events (subscription_id, event_id) values (v_sub, p_event_id)
  on conflict do nothing;
end;
$$;

create function public.remove_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Queue (pgmq) and enqueue helpers
-- ---------------------------------------------------------------------------
select pgmq.create('push_jobs');
select pgmq.create('push_jobs_dlq');

-- Job: { kind, event_id, user_id (null = everyone subscribed to the event), title, body, url, tag,
--        after_subscription_id (fan-out cursor) }. Called inside the triggering transaction (§4.6).
create function private.enqueue_push(p_kind text, p_event_id uuid, p_user_id uuid, p_title text, p_body text,
                                     p_url text, p_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Skip jobs nobody would receive.
  if not exists (
    select 1 from public.push_subscription_events pse
      join public.push_subscriptions s on s.id = pse.subscription_id
     where pse.event_id = p_event_id and (p_user_id is null or s.user_id = p_user_id)
  ) then
    return;
  end if;
  perform pgmq.send('push_jobs', jsonb_build_object(
    'kind', p_kind, 'event_id', p_event_id, 'user_id', p_user_id,
    'title', left(p_title, 120), 'body', left(coalesce(p_body, ''), 200),
    'url', p_url, 'tag', p_tag, 'after_subscription_id', null));
end;
$$;

-- Requests: new request → recipient; accepted → original sender. Declines stay silent.
create function private.connection_requests_push()
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
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    perform private.enqueue_push('request', new.event_id, private.user_of(new.to_attendee),
      coalesce(v_from_name, 'Someone') || ' wants to connect', nullif(new.note, ''), '/inbox', 'request-' || new.id);
  elsif new.status = 'accepted' and old.status = 'pending' then
    perform private.enqueue_push('accepted', new.event_id, private.user_of(new.from_attendee),
      coalesce(v_to_name, 'Someone') || ' accepted your request', 'Say hello!', '/inbox', 'accepted-' || new.id);
  end if;
  return null;
end;
$$;

create trigger connection_requests_push
  after insert or update of status on public.connection_requests
  for each row execute function private.connection_requests_push();

-- Messages: push the recipient only if they haven't looked at the chat in the last 60 s and
-- haven't had a push for it in the last 5 min (then record last_push_at).
create function private.messages_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event  uuid;
  v_sender text;
  v_cp     record;
begin
  select c.event_id into v_event from public.conversations c where c.id = new.conversation_id;
  select ac.full_name into v_sender
    from public.attendees a join public.accounts ac on ac.user_id = a.user_id where a.id = new.sender_attendee;
  for v_cp in
    update public.conversation_participants cp
       set last_push_at = now()
     where cp.conversation_id = new.conversation_id
       and cp.attendee_id is distinct from new.sender_attendee
       and (cp.last_seen_at is null or cp.last_seen_at < now() - interval '60 seconds')
       and (cp.last_push_at is null or cp.last_push_at < now() - interval '5 minutes')
    returning cp.attendee_id
  loop
    perform private.enqueue_push('message', v_event, private.user_of(v_cp.attendee_id),
      coalesce(v_sender, 'New message'), new.body, '/chat/' || new.conversation_id, 'chat-' || new.conversation_id);
  end loop;
  return null;
end;
$$;

create trigger messages_push
  after insert on public.messages
  for each row execute function private.messages_push();

-- ---------------------------------------------------------------------------
-- Publishing: claim + enqueue + broadcast in one statement/transaction (§4.6). Rows already
-- claimed are skipped, so concurrent runs produce exactly one job per announcement.
-- p_ids null = the scheduled sweep (publish_at <= now()).
-- ---------------------------------------------------------------------------
create function private.claim_announcements(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with claimed as (
    update public.announcements a
       set published_at = now(), push_enqueued_at = now()
     where a.published_at is null
       and (case when p_ids is null then a.publish_at is not null and a.publish_at <= now()
                 else a.id = any(p_ids) end)
       and exists (select 1 from public.events e where e.id = a.event_id and e.status = 'published' and e.deleted_at is null)
    returning a.id, a.event_id, a.title, a.body
  ),
  pushed as (
    select c.id, private.enqueue_push('announcement', c.event_id, null, c.title, c.body, '/home', 'announcement-' || c.id)
      from claimed c
  ),
  broadcast as (
    select realtime.send(jsonb_build_object('id', c.id), 'announcement', 'event:' || c.event_id::text, true)
      from claimed c
  )
  select (select count(*) from pushed) + 0 * (select count(*) from broadcast) into v_count;
  return v_count;
end;
$$;

create function public.publish_announcement(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.announcements a
                  where a.id = p_announcement_id and a.event_id in (select private.my_org_event_ids())) then
    raise exception 'announcement not found' using errcode = '42501';
  end if;
  if (select e.status from public.events e join public.announcements a on a.event_id = e.id
       where a.id = p_announcement_id) <> 'published' then
    raise exception 'publish the event before posting announcements' using errcode = 'P0001';
  end if;
  perform private.claim_announcements(array[p_announcement_id]);
end;
$$;

-- ---------------------------------------------------------------------------
-- Push worker wiring: pg_cron → pg_net → send-push Edge Function (§4.6)
-- ---------------------------------------------------------------------------
-- Per-environment settings live in private.secrets (never in migrations):
--   push_worker_url   e.g. https://<project>.supabase.co/functions/v1/send-push
--   service_role_key  sent as the Bearer token
create function private.kick_push_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.secrets where key = 'push_worker_url');
  v_key text := (select value from private.secrets where key = 'service_role_key');
begin
  if v_url is null or v_key is null then
    return;
  end if;
  -- Only wake the worker when a job is visible (not in flight).
  if exists (select 1 from pgmq.q_push_jobs where vt <= now()) then
    perform net.http_post(url := v_url, body := '{}'::jsonb,
                          headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
                          timeout_milliseconds := 55000);
  end if;
end;
$$;

select cron.schedule('publish-scheduled-announcements', '* * * * *', $$select private.claim_announcements()$$);
select cron.schedule('kick-push-worker', '10 seconds', $$select private.kick_push_worker()$$);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.save_push_subscription(uuid, text, text, text, text),
                          public.remove_push_subscription(text), public.publish_announcement(uuid)
  from public, anon;
grant execute on function public.save_push_subscription(uuid, text, text, text, text),
                         public.remove_push_subscription(text), public.publish_announcement(uuid)
  to authenticated;
revoke execute on function private.announcements_defaults(), private.enqueue_push(text, uuid, uuid, text, text, text, text),
                          private.connection_requests_push(), private.messages_push(),
                          private.claim_announcements(uuid[]), private.kick_push_worker()
  from public, anon, authenticated;
