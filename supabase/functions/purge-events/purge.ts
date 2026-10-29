import { type Admin, removePrefix } from "../_shared/admin.ts";

/** Hard-deletes events soft-deleted over 30 days ago (storage first, then the row), then empty deleted orgs. */
export async function purgeDeleted(admin: Admin): Promise<{ events: number; files: number; orgs: number }> {
  const { data: targets, error } = await admin.rpc("purge_targets");
  if (error) throw error;
  let files = 0;
  for (const t of targets as { event_id: string; org_id: string }[]) {
    // Storage first: if this fails the event row stays and the next run retries it.
    files += await removePrefix(admin, "event-assets", `${t.org_id}/${t.event_id}`);
    const { error: delErr } = await admin.rpc("purge_event", { p_event_id: t.event_id });
    if (delErr) throw delErr;
  }
  const { data: orgs, error: orgErr } = await admin.rpc("purge_deleted_orgs");
  if (orgErr) throw orgErr;
  return { events: targets.length, files, orgs: orgs as number };
}
