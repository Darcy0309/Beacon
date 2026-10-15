"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Timer } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { saveIdleSettings } from "@/features/settings/actions";
import { IDLE_CHOICES, IDLE_MINUTES, IDLE_ROLES } from "@/lib/idle";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Signing out after inactivity, per role (Sean, Oct 2026): how long an
 * account manager, agent or client may leave Lighthouse untouched before it
 * signs them out, or never. A call on the phone counts as activity;
 * administrators are never signed out for it. `minutes`: the security
 * setting's idle_minutes.
 */
export default function IdleSettings({ minutes = {} }) {
  const [state, action, pending] = useActionState(saveIdleSettings, EMPTY);
  useEffect(() => {
    if (state.ok) toast.success("Sign-out times saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <Card data-idle-settings>
      <SectionHeader label="Sign Out After Inactivity" icon={Timer} />
      <form action={action} className="space-y-4 p-5">
        <p className="max-w-2xl text-sm text-muted-foreground">
          How long someone can leave Lighthouse untouched before it signs them out, to keep accounts safe on a shared desk.
          A call on the phone counts as activity. Administrators are never signed out for inactivity.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {IDLE_ROLES.map(([role, label]) => (
            <Field key={role} label={label}>
              <Select name={role} defaultValue={String(minutes?.[role] ?? IDLE_MINUTES)} data-idle-role={role}>
                {IDLE_CHOICES.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
              </Select>
            </Field>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Card>
  );
}
