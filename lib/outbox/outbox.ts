// Offline message outbox (§4.5): a message is written to IndexedDB before sending and removed
// only after the server confirms it. send_message is idempotent on client_msg_id, so retrying
// after a lost response can never create a duplicate.

export type OutboxItem = {
  client_msg_id: string;
  conversation_id: string;
  body: string;
  created_at: string;
  /** Enqueue order. Assigned by enqueue(); timestamps alone can tie within a millisecond. */
  seq?: number;
  /** Set when the server rejected the message for good (e.g. conversation became read-only). */
  error?: string;
};

let lastSeq = 0;
/** Strictly increasing across calls in this tab, and roughly time-ordered across tabs. */
function nextSeq(): number {
  lastSeq = Math.max(lastSeq + 1, Date.now() * 1000);
  return lastSeq;
}

const DB_NAME = "introhall-outbox";
const STORE = "messages";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "client_msg_id" });
      store.createIndex("conversation_id", "conversation_id");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function enqueue(item: OutboxItem): Promise<void> {
  await tx("readwrite", (s) => s.put({ ...item, seq: item.seq ?? nextSeq() }));
}

export async function remove(clientMsgId: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(clientMsgId));
}

export async function list(conversationId?: string): Promise<OutboxItem[]> {
  const all = (await tx<OutboxItem[]>("readonly", (s) =>
    conversationId ? s.index("conversation_id").getAll(conversationId) : s.getAll())) ?? [];
  return all.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.created_at.localeCompare(b.created_at));
}

export type SendResult = { ok: true } | { ok: false; retry: boolean; error: string };

let flushing: Promise<number> | null = null;

/**
 * Sends queued messages oldest-first. Stops at the first retryable failure (offline, rate limit)
 * so order is preserved; permanently rejected items are kept with `error` set for the UI.
 * Concurrent calls share one run. Returns how many were delivered.
 */
export function flush(send: (item: OutboxItem) => Promise<SendResult>): Promise<number> {
  flushing ??= (async () => {
    let sent = 0;
    try {
      for (const item of await list()) {
        if (item.error) continue;
        const res = await send(item);
        if (res.ok) {
          await remove(item.client_msg_id);
          sent++;
        } else if (res.retry) {
          break;
        } else {
          await enqueue({ ...item, error: res.error });
        }
      }
    } finally {
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}
