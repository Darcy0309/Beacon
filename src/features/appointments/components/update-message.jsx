"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquareShare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select } from "@/components/ui/field";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { sendNotification } from "@/features/notifications/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const NOTE_MAX = 600;

/**
 * Send an appointment update on (Sean, Oct 2026): from Appointment Updates,
 * to the manager who set it by default or anyone on staff (to follow up, say,
 * on an invalid appointment and reschedule it, or to hand it to another
 * manager), as a message with the update, a note and a link to the lead.
 *
 *   update    { id, leadId, co, client, summary, statusText, managerId, manager }
 *   staff     [{ id, name, role }]
 */
export default function UpdateMessage({ update, staff }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(update.managerId ? String(update.managerId) : "");
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState(sendNotification, EMPTY);

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Sent to ${staff.find((s) => String(s.id) === to)?.name ?? "them"}`);
      setOpen(false);
      setNote("");
    } else if (state?.error) {
      toast.error(state.error);
    }
    // Only when an answer comes back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const title = `Appointment update: ${update.co} · ${update.statusText}`.slice(0, 120);
  const body = [update.summary, note.trim() ? `Note: ${note.trim()}` : null].filter(Boolean).join("\n\n").slice(0, 1000);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" aria-label={`Send this update to a manager: ${update.co}`} title="Send this update to a manager"
          className="ml-1.5 inline-flex size-6 items-center justify-center rounded-md align-middle text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          data-update-message={update.id}>
          <MessageSquareShare className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send this update</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4" data-update-message-form>
          <input type="hidden" name="title" value={title} />
          <input type="hidden" name="body" value={body} />
          <input type="hidden" name="link" value={update.leadId ? `/leads/${update.leadId}?tab=updates` : ""} />
          <Field label="To" hint={update.managerId ? `${update.manager} set this appointment` : null}>
            <Select name="user_ids" value={to} onChange={(e) => setTo(e.target.value)} required>
              <option value="" disabled>Choose someone</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
            </Select>
          </Field>
          <div className="rounded-lg border border-[var(--panel-border)] bg-muted/40 px-3 py-2 text-sm" data-update-summary>
            <div className="font-semibold">{update.co}</div>
            <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{update.summary}</p>
            {update.leadId ? <p className="mt-1 text-xs text-primary">With a link to the lead</p> : null}
          </div>
          <Field label="Note" hint={`${note.length}/${NOTE_MAX}`}>
            <Textarea name="note" value={note} maxLength={NOTE_MAX} rows={4} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Invalid: please call them back and reschedule, or hand it to someone who can." />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !to}><Send /> {pending ? "Sending…" : "Send"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
