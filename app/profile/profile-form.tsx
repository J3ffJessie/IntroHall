"use client";

import { useFormAction } from "@/lib/use-form-action";
import type { ProfileInput } from "@/lib/profile";
import { updateProfile, type ProfileState } from "./actions";

const input = "w-full rounded-md border border-border-strong px-3 py-2 text-base";

export function ProfileForm({ initial }: { initial: ProfileInput }) {
  const [state, onSubmit, pending] = useFormAction<ProfileState>(updateProfile);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field id="full_name" label="Name">
        <input id="full_name" name="full_name" required maxLength={100} defaultValue={initial.full_name} className={input} />
      </Field>
      <Field id="headline" label="Headline">
        <input id="headline" name="headline" maxLength={140} defaultValue={initial.headline} className={input} />
      </Field>
      <Field id="company" label="Company">
        <input id="company" name="company" maxLength={100} defaultValue={initial.company} className={input} />
      </Field>
      <Field id="links" label="Links (one per line, up to 5)">
        <textarea id="links" name="links" rows={3} defaultValue={initial.links.join("\n")} className={input} />
      </Field>
      <button type="submit" disabled={pending}
              className="rounded-md bg-primary px-4 py-2 font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
      {state.message && (
        <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</p>
      )}
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
