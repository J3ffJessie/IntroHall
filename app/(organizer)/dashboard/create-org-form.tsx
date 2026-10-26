"use client";

import { useState } from "react";
import { Button, Field, FormMessage, inputClass } from "@/components/ui";
import { slugify } from "@/lib/slugify";
import { useFormAction } from "@/lib/use-form-action";
import { createOrganization } from "./actions";

export function CreateOrgForm() {
  const [state, onSubmit, pending] = useFormAction(createOrganization);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field id="org-name" label="Organization name">
        <input id="org-name" name="name" required maxLength={100} className={inputClass}
               onChange={(e) => !slugEdited && setSlug(slugify(e.target.value))} />
      </Field>
      <Field id="org-slug" label="Short name" hint="Lowercase letters, numbers and hyphens.">
        <input id="org-slug" name="slug" required value={slug} className={inputClass}
               onChange={(e) => { setSlugEdited(true); setSlug(e.target.value); }} />
      </Field>
      <Button type="submit" disabled={pending} className="w-fit">Create organization</Button>
      <FormMessage state={state} />
    </form>
  );
}
