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

Dev hosts are plain HTTP, so browsers don't treat them as secure contexts: avoid `crypto.randomUUID`, and expect
service-worker/push work (Phase 5) to need HTTPS locally.

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
| `pnpm db:types` | Regenerate `lib/supabase/types.ts` after a migration |

## Security model (summary)
- Reads: RLS. Helper functions live in schema `private`, which the API never exposes.
- Own-row writes: column grants + RLS (or SECURITY INVOKER RPCs).
- Cross-row writes: small SECURITY DEFINER RPCs that check `auth.uid()` first; each rejection path has a pgTAP test.
