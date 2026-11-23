"use client";

import { Button, Field, FormMessage, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { useFormAction } from "@/lib/use-form-action";
import { useHydrated } from "@/lib/use-hydrated";

type Props = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: { full_name: string; headline: string; company: string };
};

export function WelcomeForm({ action, initial }: Props) {
  const [state, onSubmit, pending] = useFormAction(action);
  const hydrated = useHydrated();
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field id="full_name" label="Your name" hint="Your team sees this next to everything you do.">
        <input id="full_name" name="full_name" required maxLength={100} autoComplete="name" autoFocus
               defaultValue={initial.full_name} className={inputClass} />
      </Field>
      <Field id="headline" label="Role or headline (optional)">
        <input id="headline" name="headline" maxLength={140} autoComplete="organization-title"
               defaultValue={initial.headline} className={inputClass} />
      </Field>
      <Field id="company" label="Company (optional)">
        <input id="company" name="company" maxLength={100} autoComplete="organization"
               defaultValue={initial.company} className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending || !hydrated} className="w-full">{pending ? "Saving…" : "Continue"}</Button>
      <FormMessage state={state} />
    </form>
  );
}
