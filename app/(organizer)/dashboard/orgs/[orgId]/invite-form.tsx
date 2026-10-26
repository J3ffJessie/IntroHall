"use client";

import { Button, Field, FormMessage, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { createInvite, type InviteState } from "./actions";

export function InviteForm({ orgId }: { orgId: string }) {
  const [state, onSubmit, pending] = useFormAction<InviteState>(createInvite.bind(null, orgId), { resetOnSuccess: true });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-border pt-3">
      <h3 className="text-sm font-medium">Invite a teammate</h3>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field id="invite-email" label="Email">
            <input id="invite-email" name="email" type="email" required className={inputClass} />
          </Field>
        </div>
        <Field id="invite-role" label="Role">
          <select id="invite-role" name="role" defaultValue="staff" className={inputClass}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Button type="submit" disabled={pending}>Create invite</Button>
      </div>
      <FormMessage state={state} />
      {state.link && (
        <input readOnly aria-label="Invite link" value={state.link} className={`${inputClass} font-mono text-sm`}
               onFocus={(e) => e.currentTarget.select()} />
      )}
    </form>
  );
}
