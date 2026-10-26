// Phase 2 AC: 500 OTP sign-ups + joins per minute from a single IP, p95 < 1 s, 0 errors.
// Run against the local stack:
//   k6 run -e ANON_KEY=<key> -e SLUG=<published event slug> [-e CODE=<join code>] load/join.js
// Mailpit (local Supabase) stands in for the inbox; each iteration is a brand-new attendee.
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const API = __ENV.API ?? "http://127.0.0.1:54321";
const MAILPIT = __ENV.MAILPIT ?? "http://127.0.0.1:54324";
const KEY = __ENV.ANON_KEY;
const SLUG = __ENV.SLUG;
const CODE = __ENV.CODE ?? null;

const otpSend = new Trend("otp_send", true);
const otpVerify = new Trend("otp_verify", true);
const joinRpc = new Trend("join_rpc", true);
const joinFailures = new Counter("join_failures");

export const options = {
  scenarios: {
    keynote_burst: {
      executor: "constant-arrival-rate",
      rate: 500,
      timeUnit: "1m",
      duration: "1m",
      preAllocatedVUs: 40,
      maxVUs: 120,
    },
  },
  thresholds: {
    otp_send: ["p(95)<1000"],
    otp_verify: ["p(95)<1000"],
    join_rpc: ["p(95)<1000"],
    join_failures: ["count==0"],
    checks: ["rate==1"],
  },
};

const headers = { apikey: KEY, "Content-Type": "application/json" };

export function setup() {
  if (!KEY || !SLUG) fail("Set -e ANON_KEY=... -e SLUG=...");
}

export default function joinBurst() {
  const email = `k6-${__VU}-${__ITER}-${Date.now()}@load.test`;

  const sent = http.post(`${API}/auth/v1/otp`, JSON.stringify({ email, create_user: true }), { headers });
  otpSend.add(sent.timings.duration);
  if (!check(sent, { "otp sent": (r) => r.status === 200 })) return;

  // Mail delivery is not part of the measured latency.
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    const res = http.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`,
      { tags: { name: "mailpit" } });
    const id = res.json("messages.0.ID");
    if (id) {
      const text = http.get(`${MAILPIT}/api/v1/message/${id}`, { tags: { name: "mailpit" } }).json("Text") ?? "";
      const m = text.match(/\b(\d{6})\b/);
      code = m ? m[1] : null;
    }
    if (!code) sleep(0.25);
  }
  if (!check(code, { "otp delivered": (c) => Boolean(c) })) return;

  const verified = http.post(`${API}/auth/v1/verify`, JSON.stringify({ email, token: code, type: "email" }), { headers });
  otpVerify.add(verified.timings.duration);
  if (!check(verified, { "otp verified": (r) => r.status === 200 })) return;
  const token = verified.json("access_token");

  const joined = http.post(`${API}/rest/v1/rpc/join_event`, JSON.stringify({ p_slug: SLUG, p_code: CODE }),
    { headers: { ...headers, Authorization: `Bearer ${token}` } });
  joinRpc.add(joined.timings.duration);
  const status = joined.status === 200 ? joined.json("0.status") : `http_${joined.status}`;
  if (!check(status, { joined: (s) => s === "joined" })) joinFailures.add(1);
}
