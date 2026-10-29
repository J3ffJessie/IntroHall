"use client";

import { Button, FormMessage, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { deleteAccount } from "./actions";

export function DeleteAccountForm() {
  const [state, onSubmit, pending] = useFormAction(deleteAccount);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label htmlFor="confirm-delete" className="text-sm font-medium">Type DELETE to confirm</label>
      <div className="flex flex-wrap gap-2">
        <input id="confirm-delete" name="confirm" autoComplete="off" required className={`${inputClass} max-w-40`} />
        <Button type="submit" variant="danger" disabled={pending}>{pending ? "Deleting…" : "Delete my account"}</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
