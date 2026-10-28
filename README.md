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
pnpm exec supabase functions serve     # Edge Functions (send-push) with hot reload + logs
```

Push pipeline: triggers queue jobs in pgmq → `pg_cron` (every 10 s) → `pg_net` → `send-push` Edge Function →
Web Push. Local worker URL and service key are set by `supabase/seed.sql`; VAPID keys live in `supabase/.env`
(public key also in `.env.local` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`). Production: `supabase secrets set VAPID_…` and
insert `push_worker_url` / `service_role_key` into `private.secrets`.

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
| `pnpm test:push` | `send-push` worker (Deno) against the local DB and a mock push service |
| `pnpm db:types` | Regenerate `lib/supabase/types.ts` after a migration |

## Security model (summary)
- Reads: RLS. Helper functions live in schema `private`, which the API never exposes.
- Own-row writes: column grants + RLS (or SECURITY INVOKER RPCs).
- Cross-row writes: small SECURITY DEFINER RPCs that check `auth.uid()` first; each rejection path has a pgTAP test.
