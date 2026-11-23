"use client";

import { useState, useTransition } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { useConfirm } from "@/components/confirm";
import { transferOwnership } from "./actions";

export type TransferCandidate = { userId: string; name: string; role: string };

export function TransferOwnershipForm({ orgId, orgName, candidates }:
  { orgId: string; orgName: string; candidates: TransferCandidate[] }) {
  const [to, setTo] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Invite someone to the team first. You can hand the organization to any admin or staff member.
      </p>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const person = candidates.find((c) => c.userId === to);
    if (!person) return setError("Pick who should own the organization");
    setError(null);
    const ok = await ask({
      title: `Make ${person.name} the owner of ${orgName}?`,
      description: "They can delete the organization and manage its owners. You'll stay on the team as an admin, and only they can make you the owner again.",
      action: "Transfer ownership",
      tone: "danger",
    });
    if (ok) start(async () => setError(await transferOwnership(orgId, person.userId)));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {dialog}
      <p className="text-sm text-muted-foreground">
        Hand the organization to someone on the team. You&apos;ll stay on as an admin.
      </p>
      <Field id="transfer-to" label="New owner">
        <select id="transfer-to" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} w-fit`}>
          <option value="">Choose a team member</option>
          {candidates.map((c) => <option key={c.userId} value={c.userId}>{c.name} ({c.role})</option>)}
        </select>
      </Field>
      <Button type="submit" variant="danger" disabled={pending} className="w-fit">Transfer ownership</Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
