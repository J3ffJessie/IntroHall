# IntroHall

Conference networking: organizers publish branded event pages at `{slug}.<host>`; attendees join by QR code, pick interests, get matched, and message each other.

The design and phased delivery plan lives in `../.omc/plans/conference-network-platform.md`.

## Stack
Next.js (App Router, TypeScript, Tailwind) on Vercel · Supabase (Postgres + RLS, Auth, Storage, Realtime, pg_cron, pgmq).

## Local development

Requires Node 22+, pnpm 10, and Docker (for the local Supabase stack).

```bash
pnpm install
cp .env.example .env.local           # fill NEXT_PUBLIC_SUPABASE_ANON_KEY from `pnpm db:start`
cp supabase/.env.example supabase/.env
pnpm db:start                        # Postgres, Auth, Mailpit (http://127.0.0.1:54324)
pnpm dev
```

Hosts (`*.localtest.me` resolves to 127.0.0.1, so subdomains work without /etc/hosts edits):

| URL | Serves |
|---|---|
| `http://localtest.me:3000` | marketing |
| `http://app.localtest.me:3000` | organizer dashboard, profile, sign-in |
| `http://{slug}.localtest.me:3000` | event pages (rewritten to `/e/{slug}`) |

Dev hosts are plain HTTP, so browsers don't treat them as secure contexts: avoid `crypto.randomUUID`. Service
workers, offline caching and push need HTTPS:

```bash
# one time
sudo pacman -S mkcert nss && mkcert -install
mkdir -p certs && mkcert -cert-file certs/localtest.pem -key-file certs/localtest-key.pem \
  "localtest.me" "*.localtest.me" localhost 127.0.0.1

pnpm dev:https                         # https://app.localtest.me:3000, https://{slug}.localtest.me:3000
pnpm exec supabase functions serve     # Edge Functions (send-push, delete-account, purge-events) with hot reload + logs
```

Push pipeline: triggers queue jobs in pgmq → `pg_cron` (every 10 s) → `pg_net` → `send-push` Edge Function →
Web Push. Local worker URL and service key are set by `supabase/seed.sql`; VAPID keys live in `supabase/.env`
(public key also in `.env.local` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`). Production: see the launch checklist, step 3.

## Privacy, moderation and ops

- **Account deletion** (Profile → Delete account) calls the `delete-account` Edge Function with the user's token:
  anonymize + delete event data (`delete_account_data()`), delete `avatars/{uid}/…`, delete the auth user. Sole
  owners of an organization must delete it first. **Data export**: Profile → Download my data (`/profile/export`).
- **Retention**: daily cron deletes messages `retention_days` (default 30) after an event ends, except messages
  under an open report. **Auto-archive**: hourly cron archives published events 14 days after they end.
- **Deleting events / organizations** is a soft delete. Events can be restored from the organization page for 30
  days; then the daily `purge-deleted-events` cron calls the `purge-events` Edge Function, which deletes their
  images and the rows (production setup: launch checklist, step 3).
- **Platform admins** (`/admin`: suspend organizations or people) are granted in SQL only:
  `insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';`
- **Product analytics** is off until configured: PostHog anonymous page views via `NEXT_PUBLIC_POSTHOG_KEY` (turn on
  cookieless mode in the PostHog project). Query strings (join codes) and ids are stripped from URLs.

## Launch checklist

Everything above runs locally. Going live means a hosted Supabase project, the Next.js app on Vercel, a domain,
and email. Work through these in order; `<domain>` is your root domain (e.g. `introhall.com`) and `<ref>` is the
Supabase project ref (the `xxxx` in `https://xxxx.supabase.co`).

### 1. Accounts and domain

- [ ] Buy the domain. Event pages live on subdomains (`devconf.<domain>`), which needs a wildcard domain on Vercel,
      and Vercel only issues wildcard certificates when the domain uses **Vercel's nameservers**.
- [ ] Create accounts: [Supabase](https://supabase.com), [Vercel](https://vercel.com),
      [Resend](https://resend.com) (sign-in code emails), and optionally [PostHog](https://posthog.com).

### 2. Supabase project

- [ ] Supabase dashboard → **New project**. Pick the region closest to your attendees and save the database
      password in a password manager. Use the **Pro** plan for a real event: Free pauses after a week idle and
      allows 200 concurrent Realtime connections (Pro includes 500; raise it under the project's usage settings
      if one event can exceed that).
- [ ] Note the project URL and keys: **Project Settings → API Keys**. The app and the cron jobs use the
      **anon** and **service_role** JWT keys (the "Legacy API keys" tab on newer projects).
- [ ] Link the code and apply the migrations (tables, security rules, storage bucket, cron jobs):
      ```bash
      pnpm exec supabase login
      pnpm exec supabase link --project-ref <ref>
      pnpm exec supabase db push        # never pass --include-seed: seed.sql holds local-only values
      ```
- [ ] Check: **Database → Extensions** shows `pg_cron`, `pg_net` and `pgmq` enabled, and
      **Integrations → Cron** lists `kick-push-worker`, `publish-scheduled-announcements`, `rebuild-event-stats`,
      `purge-expired-messages`, `auto-archive-events` and `purge-deleted-events`.
- [ ] Check: **Project Settings → Data API → Exposed schemas** does not include `private`.

### 3. Edge Functions and background jobs

- [ ] Generate production push keys: `npx web-push generate-vapid-keys`. Keep them for good: changing them later
      invalidates every phone's push subscription.
- [ ] Set the function secrets and deploy all three functions (`send-push`, `delete-account`, `purge-events`):
      ```bash
      pnpm exec supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:support@<domain>
      pnpm exec supabase functions deploy
      ```
- [ ] Point the cron jobs at the live functions. In **SQL Editor**:
      ```sql
      insert into private.secrets (key, value) values
        ('push_worker_url',  'https://<ref>.supabase.co/functions/v1/send-push'),
        ('purge_worker_url', 'https://<ref>.supabase.co/functions/v1/purge-events'),
        ('service_role_key', '<service_role key>')
      on conflict (key) do update set value = excluded.value;
      ```
      (`ip_salt` is generated by the migrations; leave it.)

### 4. Email (sign-in codes)

Hosted Supabase's built-in email only sends a few messages an hour to team members, so real sign-ins need Resend.

- [ ] Resend → **Domains → Add domain** (`<domain>`), add the DNS records it shows, wait for "Verified".
- [ ] Resend → **API Keys → Create API key** (sending access).
- [ ] Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
      host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key,
      sender `no-reply@<domain>`, sender name `IntroHall`.
- [ ] Supabase → **Authentication → Emails → Templates**: for **Magic Link** and **Confirm signup**, set the subject
      to `Your IntroHall sign-in code` and paste the HTML from `supabase/templates/magic_link.html` and
      `confirmation.html`. Without this, people get a link instead of the 6-digit code the app asks for.
- [ ] Supabase → **Authentication → Sign In / Providers → Email**: email OTP length **6**, expiry **900** seconds,
      "Confirm email" off (the code itself confirms the address).
- [ ] Supabase → **Authentication → Rate Limits**: raise "emails sent per hour" (local uses 1000) so a keynote
      rush of sign-ups isn't throttled.

### 5. Sign-in addresses and Google

- [ ] Supabase → **Authentication → URL Configuration**: Site URL `https://app.<domain>`; Redirect URLs
      `https://*.<domain>/**` and `https://<domain>/**`.
- [ ] Google Cloud console → your OAuth client → **Authorized redirect URIs** → add
      `https://<ref>.supabase.co/auth/v1/callback`. Under **Branding → Authorized domains**, add `<domain>`.
- [ ] Supabase → **Authentication → Sign In / Providers → Google**: enable, paste the client ID and secret, save.
- [ ] Google Cloud console → **Audience → Publish app**, so anyone can sign in, not only test users.

### 6. Vercel

- [ ] Vercel → **Add New → Project** → import the repository (framework Next.js, install `pnpm install`).
- [ ] **Settings → Environment Variables** (Production):

      | Variable | Value |
      |---|---|
      | `NEXT_PUBLIC_ROOT_DOMAIN` | `<domain>` (no `https://`, no port) |
      | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
      | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key |
      | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the VAPID public key from step 3 |
      | `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | optional |

      `NEXT_PUBLIC_*` values are baked in at build time: **redeploy** after changing any of them.
- [ ] **Settings → Domains**: add `<domain>` and `*.<domain>` (this covers `app.<domain>` and every event).
- [ ] **Settings → Functions → Region**: the same region as the Supabase project.
- [ ] Deploy.

### 7. Smoke test on the live site

- [ ] `https://app.<domain>` → sign in with an email code; then with Google.
- [ ] Make yourself a platform admin (**SQL Editor**):
      `insert into public.platform_admins (user_id) select id from auth.users where email = '<you>';`
      then open `https://app.<domain>/admin`.
- [ ] Create an organization and an event, upload a banner, publish, open `https://<slug>.<domain>`.
- [ ] Join from two phones via the QR code, pick interests, see each other in Matches, connect, message.
- [ ] Turn on notifications on one phone (iPhone: add to Home Screen first) and send it a message with the
      app closed; it should arrive within ~15 s.
- [ ] Post an announcement; both phones see it.
- [ ] Jobs are running (**SQL Editor**):
      ```sql
      select jobname, status, return_message, start_time
      from cron.job_run_details d join cron.job using (jobid)
      order by start_time desc limit 20;
      ```
      and the push worker answers (status 200): `select status_code, created from net._http_response order by created desc limit 5;`
- [ ] Profile → Download my data works; delete a throwaway test account and check it can no longer sign in.
- [ ] Supabase → **Advisors → Security Advisor** shows no errors.
- [ ] Before a large event: run the Realtime load test (`load/realtime.js`) against the hosted project at the
      expected attendee count.

## Checks

| Command | What |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ESLint, tsc |
| `pnpm test` | Vitest unit tests (`tests/unit`) |
| `pnpm db:lint` | squawk migration lint |
| `pnpm db:test` | pgTAP: RLS, grants, RPC rejection paths (`supabase/tests`) |
| `pnpm test:integration` | Concurrency checks against the local DB, e.g. the attendee cap under 150 parallel joins |
| `k6 run -e ANON_KEY=… -e SLUG=… load/join.js` | Keynote-burst load test (500 sign-ups + joins/min); needs [k6](https://k6.io) |
| `node load/seed-matches.mts && k6 run -e ANON_KEY=… load/matches.js` | Matching load test: 5,000 attendees × 20 interests, 50 req/s |
| `node load/seed-realtime.mts 90 && k6 run -e ANON_KEY=… -e CONNS=180 -e RATE=25 load/realtime.js` | Realtime chat load test. Local Realtime caps 200 connections / 100 events/s; run the 2,000-connection version against the hosted project |
| `pnpm test:e2e` | Playwright + axe (needs `pnpm db:start`) |
| `pnpm test:e2e:https` | Service-worker/offline + announcements e2e over HTTPS (needs mkcert certs) |
| `pnpm test:functions` | Edge Functions (Deno) against the local stack: push worker (mock push service), account deletion, event purge |
| `pnpm db:types` | Regenerate `lib/supabase/types.ts` after a migration |

## Security model (summary)
- Reads: RLS. Helper functions live in schema `private`, which the API never exposes.
- Own-row writes: column grants + RLS (or SECURITY INVOKER RPCs).
- Cross-row writes: small SECURITY DEFINER RPCs that check `auth.uid()` first; each rejection path has a pgTAP test.
