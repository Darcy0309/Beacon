"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogOpen } from "@/components/shared/row-edit-context";
import { handOverPreview, handOverWork } from "@/features/users/actions";
import { reach } from "@/lib/reach";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

// What is handed over, as it reads: [key, one, many].
const WHAT = [
  ["projects", "project", "projects", "they work on (the person taking over is put in their place)"],
  ["names", "name", "names", "still to work, or with an appointment to follow up"],
  ["appointments", "appointment", "appointments", "to follow up: confirming, the client's updates (still to come, or in the last 30 days)"],
  ["reminders", "reminder", "reminders", "still to go off"],
  ["clients", "client", "clients", "as their Sales Rep"],
  ["watching", "client", "clients", "they hear about"],
  ["links", "prospect link", "prospect links", "for List Builder requests"],
];
const count = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * "Hand over work" from a staff member's row (Sean, Oct 2026: a manager who
 * leaves): what they still hold, and who takes it over. What they did (calls,
 * leads developed, appointments set, pay) stays theirs; their own synced
 * calendars come off. Then disable their account as usual.
 */
export default function HandOverForm({ user, staff }) {
  const [open, setOpen, , onCloseAutoFocus] = useDialogOpen();
  const [state, action, pending] = useActionState(handOverWork, EMPTY);
  const [held, setHeld] = useState(null);
  const [to, setTo] = useState("");
  const router = useRouter();
  const { fe, invalid } = formHelpers(state, null);
  const handled = useRef(null);
  const others = staff.filter((p) => p.id !== user.id);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setHeld(null);
    setTo("");
    reach(() => handOverPreview(user.id)).then((r) => {
      if (!live) return;
      if (r.ok) setHeld(r.data);
      else toast.error(r.error);
    });
    return () => { live = false; };
  }, [open, user.id]);

  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      const moved = WHAT.filter(([k]) => state.data?.[k] > 0).map(([k, one, many]) => count(state.data[k], one, many));
      toast.success(`${user.name}'s work handed over`, { description: moved.length ? moved.join(" · ") : "There was nothing still to hand over." });
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state, router, setOpen, user.name]);

  const shown = held ? WHAT.filter(([k]) => held[k] > 0) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg" onCloseAutoFocus={onCloseAutoFocus} data-hand-over-dialog>
        <DialogHeader>
          <DialogTitle>Hand over {user.name}&apos;s work</DialogTitle>
          <DialogDescription>
            What they still have to do goes to the person you choose. What they did stays theirs: their calls, the leads they
            developed, the appointments they set, their pay and production.
          </DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4" data-hand-over-form>
          <input type="hidden" name="from" value={user.id} />
          <div className="rounded-lg border border-[var(--panel-border)] p-3 text-sm" data-hand-over-held>
            {!held ? (
              <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Looking at what they hold…</p>
            ) : shown.length ? (
              <ul className="space-y-1">
                {shown.map(([k, one, many, why]) => (
                  <li key={k} data-held={k}><strong className="tabular-nums">{count(held[k], one, many)}</strong> <span className="text-muted-foreground">{why}</span></li>
                ))}
                {held.calendars > 0 ? <li className="text-muted-foreground" data-held="calendars">Their synced calendar comes off the project calendars.</li> : null}
              </ul>
            ) : (
              <p className="text-muted-foreground">Nothing still to hand over: no projects, open names, appointments to follow up or reminders.</p>
            )}
          </div>
          <Field label="Who takes it over" required error={fe("to")}>
            <Select name="to" value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={invalid("to")} aria-label="Who takes it over" data-hand-over-to>
              <option value="">Choose…</option>
              {others.map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? ` (${p.role})` : ""}</option>)}
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            Leaving us? Set their account to Disabled afterwards, under Edit: they can no longer sign in, and their history stays.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !held || !to} data-hand-over-go>
              {pending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />} Hand over
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
