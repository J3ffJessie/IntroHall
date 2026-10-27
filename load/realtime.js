// Phase 4 AC: N concurrent Realtime connections, RATE msgs/s through send_message, p95 delivery < 2 s.
//   node load/seed-realtime.mts <pairs>
//   k6 run -e ANON_KEY=<key> [-e CONNS=180] [-e RATE=50] load/realtime.js
// CONNS must be ≤ 2 × pairs. Local Supabase's realtime tenant caps connections at 200 and joins at
// 100/s, so the full 2,000-connection run belongs against the hosted project (set API/WS/JWT_SECRET).
import crypto from "k6/crypto";
import encoding from "k6/encoding";
import exec from "k6/execution";
import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { setInterval, clearInterval, setTimeout } from "k6/timers";
import { WebSocket } from "k6/websockets";

const API = __ENV.API ?? "http://127.0.0.1:54321";
const WS = __ENV.WS ?? "ws://127.0.0.1:54321/realtime/v1/websocket";
const KEY = __ENV.ANON_KEY;
const SECRET = __ENV.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const CONNS = Number(__ENV.CONNS ?? 180);
const RATE = Number(__ENV.RATE ?? 50);
const WARMUP_S = Number(__ENV.WARMUP_S ?? 15);
const SEND_S = Number(__ENV.SEND_S ?? 60);
const fixture = JSON.parse(open("./.realtime-fixture.json"));
const users = fixture.pairs.flatMap((p) => [p.a_user, p.b_user]).slice(0, CONNS);

const delivery = new Trend("delivery_ms", true);
const sendMs = new Trend("send_ms", true);
const received = new Counter("messages_received");
const joined = new Rate("join_ok");

export const options = {
  scenarios: {
    listeners: {
      executor: "per-vu-iterations", vus: users.length, iterations: 1,
      maxDuration: `${WARMUP_S + SEND_S + 30}s`, exec: "listen",
    },
    senders: {
      executor: "constant-arrival-rate", rate: RATE, timeUnit: "1s", duration: `${SEND_S}s`,
      startTime: `${WARMUP_S}s`, preAllocatedVUs: 20, maxVUs: 100, exec: "send",
    },
  },
  thresholds: {
    delivery_ms: ["p(95)<2000"],
    join_ok: ["rate==1"],
    "http_req_failed{scenario:senders}": ["rate==0"],
  },
};

function jwt(sub) {
  const enc = (o) => encoding.b64encode(JSON.stringify(o), "rawurl");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({
    sub, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600,
  })}`;
  return `${body}.${crypto.hmac("sha256", SECRET, body, "base64rawurl")}`;
}

function uuid() {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) s += h[i === 12 ? 4 : i === 16 ? 8 + Math.floor(Math.random() * 4) : Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export function listen() {
  // __VU is numbered across all scenarios; this scenario's iteration index is 0..users.length-1.
  const i = exec.scenario.iterationInTest;
  const uid = users[i];
  const ws = new WebSocket(`${WS}?apikey=${KEY}&vsn=1.0.0`);
  let ref = 0;
  const push = (topic, event, payload) => ws.send(JSON.stringify({ topic, event, payload, ref: String(++ref), join_ref: "1" }));
  let beat;

  ws.onopen = () => {
    // Stagger joins under the tenant's joins-per-second limit.
    setTimeout(() => {
      push(`realtime:user:${uid}`, "phx_join", {
        config: { broadcast: { self: false, ack: false }, presence: { key: "" }, postgres_changes: [], private: true },
        access_token: jwt(uid),
      });
    }, (i % 100) * 10 + Math.floor(i / 100) * 1100);
    beat = setInterval(() => push("phoenix", "heartbeat", {}), 25_000);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.event === "phx_reply" && msg.topic.startsWith("realtime:user:")) {
      joined.add(msg.payload && msg.payload.status === "ok");
    } else if (msg.event === "broadcast" && msg.payload && msg.payload.event === "message") {
      const body = String(msg.payload.payload.body ?? "");
      if (body.startsWith("lt:")) {
        delivery.add(Date.now() - Number(body.slice(3)));
        received.add(1);
      }
    }
  };
  ws.onerror = () => joined.add(false);
  setTimeout(() => { clearInterval(beat); ws.close(); }, (WARMUP_S + SEND_S + 10) * 1000);
}

export function send() {
  const pair = fixture.pairs[Math.floor(Math.random() * Math.min(fixture.pairs.length, Math.ceil(users.length / 2)))];
  const fromA = Math.random() < 0.5;
  const res = http.post(`${API}/rest/v1/rpc/send_message`, JSON.stringify({
    p_conversation_id: pair.conversation_id, p_client_msg_id: uuid(), p_body: `lt:${Date.now()}`,
  }), { headers: { apikey: KEY, Authorization: `Bearer ${jwt(fromA ? pair.a_user : pair.b_user)}`, "Content-Type": "application/json" } });
  sendMs.add(res.timings.duration);
  check(res, { "message stored": (r) => r.status === 200 });
}
