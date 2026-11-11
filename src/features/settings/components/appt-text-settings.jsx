"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageSquareText } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { saveApptTextSettings } from "@/features/texts/settings-actions";
import { ZONES, hourLabel } from "@/lib/delivery-schedule";
import { APPT_TEXT_FIELDS, APPT_TEXT_HOURS } from "@/lib/appointment-texts";
import { TEXT_LIMIT, textParts } from "@/lib/texts";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Appointment reminder texts (client, Nov 2026): the text a prospect gets the day before their
 * appointment, and when it goes. Turned on project by project (the project's own form). `value`:
 * the setting, checked (lib/appointment-texts.js); `projects`: how many have it on.
 */
export default function ApptTextSettings({ value, projects = 0 }) {
  const [state, action, pending] = useActionState(saveApptTextSettings, EMPTY);
  const [body, setBody] = useState(value.body);
  const box = useRef(null);
  useEffect(() => {
    if (state.ok) toast.success("Reminder texts saved");
    else if (state.error) toast.error(state.error);
  }, [state]);

  // A field put in at the cursor.
  const insert = (key) => {
    const el = box.current;
    if (!el) return;
    const at = el.selectionStart ?? el.value.length;
    setBody(`${el.value.slice(0, at)}{${key}}${el.value.slice(el.selectionEnd ?? at)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at + key.length + 2, at + key.length + 2);
    });
  };
  const parts = textParts(body);

  return (
    <Card id="appointment-texts" data-appt-text-settings>
      <SectionHeader label="Appointment Reminder Texts" icon={MessageSquareText} />
      <form action={action} className="space-y-4 p-5">
        <p className="max-w-2xl text-sm text-muted-foreground">
          The day before an appointment, the prospect is texted this reminder from Lighthouse&apos;s number. It goes only on projects
          with <span className="font-medium text-foreground">Text appointment reminders</span> ticked on the project
          ({projects === 1 ? "1 project has" : `${projects} projects have`} it on). When they reply Y, N or R, the appointment&apos;s manager
          is told, to mark it confirmed or call them.
        </p>
        <Field label="Reminder" error={state.fieldErrors?.body}>
          <Textarea ref={box} name="body" rows={4} maxLength={TEXT_LIMIT} value={body} onChange={(e) => setBody(e.target.value)} data-appt-text-body />
        </Field>
        <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Fill in for each appointment:
          {APPT_TEXT_FIELDS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => insert(key)} title={`Put ${label.toLowerCase()} here`}
              className="rounded-md border border-[var(--panel-border)] px-1.5 py-0.5 font-mono text-[0.7rem] transition-colors hover:border-primary/40 hover:text-primary">
              {`{${key}}`}
            </button>
          ))}
          <span className="ml-auto tabular-nums">{body.length.toLocaleString()} characters{parts > 1 ? ` · ${parts} texts` : ""}</span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <Field label="Goes out the day before at" error={state.fieldErrors?.hour}>
            <Select name="hour" defaultValue={String(value.hour)} data-appt-text-hour>
              {APPT_TEXT_HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </Select>
          </Field>
          <Field label="Time zone" error={state.fieldErrors?.zone}>
            <Select name="zone" defaultValue={value.zone} data-appt-text-zone>
              {ZONES.map(([z, name]) => <option key={z} value={z}>{name}</option>)}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Keep &quot;Reply Y to confirm, N to cancel, R to reschedule&quot; in it, and the client&apos;s name (carriers want the sender named), so the answers come back as the manager expects. A prospect who replies STOP isn't texted again (Twilio sees to it).</p>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Card>
  );
}
