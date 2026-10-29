import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export type Admin = SupabaseClient;

/** Service-role client: bypasses RLS, can use the Storage and Auth admin APIs. */
export function adminClient(url: string, serviceKey: string): Admin {
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Deletes every object under `prefix` in `bucket`, including nested folders. Returns how many were removed. */
export async function removePrefix(admin: Admin, bucket: string, prefix: string): Promise<number> {
  let removed = 0;
  const folders = [prefix.replace(/\/+$/, "")];
  const seen = new Set(folders);
  while (folders.length) {
    const folder = folders.pop()!;
    // Removing shifts the listing, so always read the first page until only folders remain.
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
      if (error) throw error;
      const files = data.filter((o) => o.id !== null).map((o) => `${folder}/${o.name}`);
      for (const o of data) {
        const sub = `${folder}/${o.name}`;
        if (o.id === null && !seen.has(sub)) {
          folders.push(sub);
          seen.add(sub);
        }
      }
      if (!files.length) break;
      const { error: rmErr } = await admin.storage.from(bucket).remove(files);
      if (rmErr) throw rmErr;
      removed += files.length;
      if (files.length < 1000) break;
    }
  }
  return removed;
}
