"use client";

import { useState, useTransition } from "react";
import { removeMember, revokeInvite } from "./actions";
import { useConfirm } from "@/components/confirm";

export function RemoveMemberButton({ orgId, userId, self }: { orgId: string; userId: string; self: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();
  return (
    <span className="flex items-center gap-2">
      {dialog}
      {error && <span role="alert" className="text-sm text-danger">{error}</span>}
      <button type="button" disabled={pending} className="text-sm text-danger underline"
              onClick={async () => await ask(self
                ? { title: "Leave this organization?", description: "You'll lose access to its events.", action: "Leave" }
                : { title: "Remove this member?", description: "They'll lose access to the organization's events.", action: "Remove" }) &&
                start(async () => setError(await removeMember(orgId, userId)))}>
        {self ? "Leave" : "Remove"}
      </button>
    </span>
  );
}

export function RevokeInviteButton({ orgId, inviteId }: { orgId: string; inviteId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="text-sm underline"
            onClick={() => start(() => revokeInvite(orgId, inviteId))}>
      Revoke
    </button>
  );
}
