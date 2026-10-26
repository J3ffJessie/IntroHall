// Phase 3 AC: get_matches p95 < 150 ms at 5,000 attendees × 20 tags.
//   node load/seed-matches.mts && k6 run -e ANON_KEY=<key> load/matches.js
// Signs attendee JWTs with the local development JWT secret (never use this against production).
import crypto from "k6/crypto";
import encoding from "k6/encoding";
import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

const API = __ENV.API ?? "http://127.0.0.1:54321";
const KEY = __ENV.ANON_KEY;
const SECRET = __ENV.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const fixture = JSON.parse(open("./.matches-fixture.json"));

const matches = new Trend("get_matches", true);
const filtered = new Trend("get_matches_filtered", true);
const everyone = new Trend("get_matches_everyone", true);

export const options = {
  scenarios: {
    browsing: { executor: "constant-arrival-rate", rate: 50, timeUnit: "1s", duration: "1m", preAllocatedVUs: 20, maxVUs: 100 },
  },
  thresholds: {
    get_matches: ["p(95)<150"],
    get_matches_filtered: ["p(95)<150"],
    get_matches_everyone: ["p(95)<150"],
    checks: ["rate==1"],
  },
};

function jwt(sub) {
  const enc = (o) => encoding.b64encode(JSON.stringify(o), "rawurl");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({
    sub, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600,
  })}`;
  return `${body}.${crypto.hmac("sha256", SECRET, body, "base64rawurl")}`;
}

export default function browse() {
  const user = fixture.users[Math.floor(Math.random() * fixture.users.length)];
  const r = Math.random();
  // 70 % plain matches, 20 % filtered by a topic, 10 % Everyone tab; first page (31 rows) like the UI.
  const body = { p_event_id: fixture.eventId, p_limit: 31 };
  let trend = matches;
  if (r < 0.2) {
    body.p_tag = fixture.tags[Math.floor(Math.random() * fixture.tags.length)];
    trend = filtered;
  } else if (r < 0.3) {
    body.p_mode = "everyone";
    trend = everyone;
  }
  const res = http.post(`${API}/rest/v1/rpc/get_matches`, JSON.stringify(body), {
    headers: { apikey: KEY, Authorization: `Bearer ${jwt(user)}`, "Content-Type": "application/json" },
  });
  trend.add(res.timings.duration);
  check(res, { "200": (x) => x.status === 200, "array": (x) => Array.isArray(x.json()) });
}
