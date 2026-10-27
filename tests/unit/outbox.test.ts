import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { enqueue, flush, list, type OutboxItem } from "@/lib/outbox/outbox";
import { uuidv4 } from "@/lib/uuid";

const item = (body: string, conv = "c1"): OutboxItem => ({
  client_msg_id: uuidv4(), conversation_id: conv, body, created_at: new Date().toISOString(),
});

beforeEach(async () => {
  for (const i of await list()) await (await import("@/lib/outbox/outbox")).remove(i.client_msg_id);
});

describe("outbox", () => {
  it("keeps messages while offline and sends each exactly once when back online", async () => {
    const a = item("one");
    const b = item("two");
    await enqueue(a);
    await new Promise((r) => setTimeout(r, 2));
    await enqueue(b);

    let online = false;
    const server: string[] = [];
    const send = async (i: OutboxItem) => {
      if (!online) return { ok: false as const, retry: true, error: "offline" };
      // Idempotent like send_message: a retry of the same id is not stored twice.
      if (!server.includes(i.client_msg_id)) server.push(i.client_msg_id);
      return { ok: true as const };
    };

    expect(await flush(send)).toBe(0);
    expect((await list()).map((i) => i.body)).toEqual(["one", "two"]);

    online = true;
    const [x, y] = await Promise.all([flush(send), flush(send)]);
    expect(x).toBe(2);
    expect(y).toBe(2); // concurrent flushes share one run
    expect(server).toEqual([a.client_msg_id, b.client_msg_id]);
    expect(await list()).toEqual([]);
  });

  it("marks permanently rejected messages and continues with the rest", async () => {
    await enqueue(item("rejected"));
    await new Promise((r) => setTimeout(r, 2));
    await enqueue(item("fine"));
    const sent = await flush(async (i) =>
      i.body === "rejected" ? { ok: false, retry: false, error: "read-only" } : { ok: true });
    expect(sent).toBe(1);
    expect((await list()).map((i) => [i.body, i.error])).toEqual([["rejected", "read-only"]]);
  });

  it("filters by conversation", async () => {
    await enqueue(item("a", "c1"));
    await enqueue(item("b", "c2"));
    expect((await list("c2")).map((i) => i.body)).toEqual(["b"]);
  });
});

it("uuidv4 is a valid v4 UUID", () => {
  expect(uuidv4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
