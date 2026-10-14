"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import DatePicker from "@/components/shared/date-picker";
import { sendLead } from "@/features/leads/actions";
import { REMINDER_TIMES } from "@/lib/validate";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Send this lead to someone on the team to call (Sean, Oct 2026): a manager
 * hands a hot lead, say, to the appointment manager. It becomes theirs to
 * work (unless that is unticked), they get a notification with the note and
 * a link to the lead, and with a day and time a call-back reminder is set
 * for them, which they can add to their own calendar from the lead.
 * `people`: getAssignableStaff(), without whoever is sending.
 */
export default function SendLead({ leadId, company, people }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(sendLead, EMPTY);
  const { fe, invalid, dv } = formHelpers(state, null);
  useEffect(() => {
    if (state?.ok) {
      toast.success(`Sent: ${people.find((p) => String(p.id) === String(state.data?.to))?.name ?? "they"} will be told`);
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state, router, people]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="w-full" data-send-lead><Send /> Send to a manager</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send this lead to someone to call</DialogTitle>
          <DialogDescription>{company}: they are told at once, with your note and a link to the lead.</DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-3" data-send-lead-form>
          <input type="hidden" name="lead_id" value={leadId} />
          <Field label="Send to" required error={fe("to")}>
            <Select name="to" defaultValue={dv("to", "")} aria-invalid={invalid("to")}>
              <option value="">Choose who</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
            </Select>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="assign" defaultChecked className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>Hand the lead to them <span className="block text-xs text-muted-foreground">It goes on their call list, so they can record the call.</span></span>
          </label>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Call on" error={fe("remind_date")} hint="Optional: sets a call-back reminder for them">
              <DatePicker name="remind_date" defaultValue={dv("remind_date")} invalid={invalid("remind_date")} aria-label="Day to call" min="today" presets={["today", "tomorrow", "nextMonday"]} future />
            </Field>
            <Field label="At" error={fe("remind_time")}>
              <Select name="remind_time" defaultValue={dv("remind_time", "")} aria-invalid={invalid("remind_time")}>
                <option value="">—</option>
                {REMINDER_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Note" error={fe("note")}>
            <Textarea name="note" rows={3} maxLength={1000} defaultValue={dv("note")} placeholder="Hot lead: owner wants a quote before the 15th" aria-invalid={invalid("note")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}><Send /> {pending ? "Sending…" : "Send"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
