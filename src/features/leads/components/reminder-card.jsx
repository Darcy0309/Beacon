"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlarmClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import DatePicker from "@/components/shared/date-picker";
import { cancelReminder, setReminder } from "@/features/leads/actions";
import { REMINDER_TIMES } from "@/lib/validate";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * "Remind me to call back", above the call result buttons, so it is set
 * before saving the result and moving on. At the chosen day and time (the
 * business's clock) a notification links back to this lead. Lists my
 * reminders on this name that have not gone off yet, each with Cancel.
 * `upcoming`: [{ id, when, note }], `when` already in words.
 */
export default function ReminderCard({ leadId, company, upcoming }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(setReminder, EMPTY);
  const [cancelling, startCancel] = useTransition();
  const { fe, invalid, dv } = formHelpers(state, null);
  const problem = state?.error && !state?.fieldErrors ? state.error : null;

  useEffect(() => {
    if (state?.ok) {
      toast.success("Reminder set");
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  const cancel = (id) =>
    startCancel(async () => {
      const f = new FormData();
      f.set("id", String(id));
      f.set("lead_id", String(leadId));
      const result = await cancelReminder(f);
      if (result.ok) {
        toast.success("Reminder cancelled");
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <Card data-reminders className="p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <AlarmClock className="size-3.5 text-primary" /> Call-back reminder
        </span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" data-set-reminder>Remind me</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Remind me to call {company}</DialogTitle>
              <DialogDescription>A notification will link you back to this lead at the time you choose.</DialogDescription>
            </DialogHeader>
            <form action={formAction} noValidate className="flex flex-col gap-4">
              <input type="hidden" name="lead_id" value={leadId} />
              {problem ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{problem}</p>
              ) : null}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
                <Field label="Day" required error={fe("remind_date")}>
                  <DatePicker name="remind_date" required defaultValue={dv("remind_date")} invalid={invalid("remind_date")} aria-label="Reminder day"
                    min="today" presets={["today", "tomorrow", "nextMonday"]} future />
                </Field>
                <Field label="Time" required error={fe("remind_time")}>
                  <Select name="remind_time" defaultValue={dv("remind_time", "")} aria-invalid={invalid("remind_time")}>
                    <option value="" disabled>Choose a time</option>
                    {REMINDER_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Note" error={fe("note")} hint="e.g. Ask for Henry; he decides on the renewal">
                <Textarea name="note" rows={2} maxLength={300} defaultValue={dv("note")} aria-invalid={invalid("note")} />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Set reminder"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {upcoming.length ? (
        <ul className="mt-2 space-y-1">
          {upcoming.map((m) => (
            <li key={m.id} data-reminder={m.id} className="flex items-start justify-between gap-2 rounded-md bg-primary/5 px-2.5 py-1.5 text-xs">
              <span className="min-w-0">
                <span className="font-semibold text-primary">{m.when}</span>
                {m.note ? <span className="block break-words text-muted-foreground">{m.note}</span> : null}
              </span>
              <button type="button" disabled={cancelling} onClick={() => cancel(m.id)} aria-label={`Cancel the reminder for ${m.when}`}
                className="mt-0.5 shrink-0 cursor-pointer rounded text-muted-foreground transition-colors hover:text-destructive">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
