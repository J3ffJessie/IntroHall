"use client";

import { useTransition } from "react";
import { leaveEvent, setProfileVisibility } from "@/app/e/[slug]/actions";
import { Button, Card } from "@/components/ui";
import { useConfirm } from "@/components/confirm";
import { EyeSlash, Eye, SignOut, ShieldCheck } from "@phosphor-icons/react";

export function HomeActions({ slug, hidden, eventName }: { slug: string; hidden: boolean; eventName: string }) {
  const [pending, start] = useTransition();
  const [ask, dialog] = useConfirm();
  return (
    <Card title="Privacy" icon={<ShieldCheck weight="duotone" />}>
      {dialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {hidden ? "Hidden: you don't appear in matches." : "Visible: attendees who share your interests can find you."}
        </p>
        <Button variant="secondary" disabled={pending}
                onClick={() => start(() => setProfileVisibility(slug, hidden ? "visible" : "hidden"))}>
          {hidden ? <Eye /> : <EyeSlash />}{hidden ? "Show my profile" : "Hide my profile"}
        </Button>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Leaving removes you from {eventName}. You can rejoin later.</p>
        <Button variant="danger" disabled={pending}
                onClick={async () => await ask({ title: `Leave ${eventName}?`, description: "You'll disappear from matches. You can rejoin later.", action: "Leave event" }) &&
                  start(() => leaveEvent(slug))}>
          <SignOut />Leave event
        </Button>
      </div>
    </Card>
  );
}
