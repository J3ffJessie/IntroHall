import { Pool, type PoolClient } from "pg";

export const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Runs `fn` in a transaction as the `authenticated` role with `userId` as auth.uid(). */
export async function asUser<T>(pool: Pool, userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: userId, role: "authenticated" })]);
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
