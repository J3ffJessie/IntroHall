import { type Admin, removePrefix } from "../_shared/admin.ts";

/** The account can't be deleted yet (it is the only owner of an organization). */
export class BlockedError extends Error {}

/**
 * §3.3 account deletion. Each step is idempotent, so a failed run can simply be retried:
 * (1) anonymize the account and delete its event data, (2) delete its avatar files,
 * (3) delete the auth.users row (sessions and identities go with it).
 */
export async function deleteAccount(admin: Admin, userId: string): Promise<void> {
  const { error } = await admin.rpc("delete_account_data", { p_user_id: userId });
  if (error) throw error.code === "P0001" ? new BlockedError(error.message) : error;
  await removePrefix(admin, "avatars", userId);
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr && authErr.status !== 404) throw authErr;
}
