"use client";

import { useState, useTransition } from "react";
import { Button, FormMessage, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { deleteOrganization, restoreEvent } from "./actions";

export function RestoreEventButton({ orgId, eventId, name }: { orgId: string; eventId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {error && <span role="alert" className="text-sm text-danger">{error}</span>}
      <button type="button" disabled={pending} className="text-sm underline" aria-label={`Restore ${name}`}
              onClick={() => start(async () => setError(await restoreEvent(orgId, eventId)))}>
        Restore
      </button>
    </span>
  );
}

export function DeleteOrgForm({ orgId, name }: { orgId: string; name: string }) {
  const [state, onSubmit, pending] = useFormAction(deleteOrganization.bind(null, orgId, name));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        Deletes the organization and all of its events. Their pages go offline immediately and everything is
        permanently removed after 30 days. Team members lose access.
      </p>
      <label htmlFor="confirm-org" className="text-sm font-medium">Type <span className="font-semibold">{name}</span> to confirm</label>
      <div className="flex flex-wrap gap-2">
        <input id="confirm-org" name="confirm" autoComplete="off" required className={`${inputClass} max-w-xs`} />
        <Button type="submit" variant="danger" disabled={pending}>Delete organization</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
