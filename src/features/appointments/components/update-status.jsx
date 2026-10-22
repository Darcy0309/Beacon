"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StampedTextarea from "@/components/shared/stamped-textarea";
import { updateAppointmentStatus } from "@/features/appointments/actions";
import { SOLD_LINES, UPDATE_STATUSES, money, parseAmount } from "@/lib/appointment-updates";
import { formatIso } from "@/lib/dates";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Update status (Sean, Oct 2026): how an appointment went, as the client
 * says it. One status from the nine; then a note (stamped with the day and
 * their name, as the managers' notes are), and with Valid-Quoting the
 * potential premium, with Sold Account each policy line's premium and the
 * carrier it was placed with (the total is what was written).
 *
 *   appt      a row of getClientAppointments() / getLeadAppointments()
 *   carriers  the carrier names to pick from
 */
export default function UpdateStatus({ appt, carriers, open: openProp, onOpenChange, trigger = true }) {
  const router = useRouter();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [state, action, pending] = useActionState(updateAppointmentStatus, EMPTY);
  const { fe, invalid } = formHelpers(state, null);
  const current = appt.update && appt.update !== "pending_appointment" && appt.update !== "no_status" ? appt.update : "";
  const [status, setStatus] = useState(current);
  const [boxes, setBoxes] = useState({});
  const handled = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStatus(current);
    setBoxes(Object.fromEntries((appt.soldLines ?? []).map((l) => [l.line, { premium: String(l.premium ?? ""), carrier: l.carrier ?? "" }])));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      toast.success(`Updated: ${state.data?.label ?? "saved"}`);
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors?.status) toast.error(state.error);
  }, [state, router, setOpen]);

  const total = SOLD_LINES.reduce((t, [k]) => {
    const v = parseAmount(boxes[k]?.premium);
    return t + (Number.isFinite(v) ? v : 0);
  }, 0);
  const setBox = (k, field, v) => setBoxes((b) => ({ ...b, [k]: { ...b[k], [field]: v } }));
  const when = `${formatIso(appt.date, "long")}${appt.apptTime ? ` at ${appt.apptTime}` : ""}`;

  return (
    <>
      {trigger ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} data-update-status={appt.id}>
          <ClipboardCheck /> Update status
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl" data-update-dialog={appt.id}>
          <DialogHeader>
            <DialogTitle>Update status · {appt.co}</DialogTitle>
            <DialogDescription>
              The appointment on {when}{appt.project ? `, ${appt.project}` : ""}.
              {appt.dueOn ? <> Update it by <strong className="text-foreground">{formatIso(appt.dueOn, "long")}</strong>: an invalid appointment is credited only if you tell us by then.</> : null}
            </DialogDescription>
          </DialogHeader>
          <form action={action} noValidate className="flex flex-col gap-4" data-update-form>
            <input type="hidden" name="appointment_id" value={appt.id} />
            {appt.leadId ? <input type="hidden" name="lead_id" value={appt.leadId} /> : null}
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="lines" value={JSON.stringify(boxes)} />

            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">How did it go? Choose one.</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Status">
                {UPDATE_STATUSES.map(([key, label, color]) => (
                  <button key={key} type="button" role="radio" aria-checked={status === key} onClick={() => setStatus(key)} data-status-option={key}
                    className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      status === key ? "border-primary bg-primary/12 font-semibold" : "border-[var(--panel-border)] hover:bg-muted")}>
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                    {label}
                  </button>
                ))}
              </div>
              {fe("status") ? <p className="mt-1.5 text-xs text-destructive">{fe("status")}</p> : null}
            </fieldset>

            {status === "valid_quoting" ? (
              <Field label="Potential premium" error={fe("potential_premium")} hint="What you expect to write: it counts in your Sale Pipeline as In the pipe.">
                <Input name="potential_premium" inputMode="decimal" placeholder="e.g. 12,500" defaultValue={appt.potential ?? ""} aria-invalid={invalid("potential_premium")} data-potential-premium />
              </Field>
            ) : null}

            {status === "sold" ? (
              <div data-sold-lines>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Premium on each policy line sold, and the carrier it was placed with</div>
                <div className="space-y-2">
                  {SOLD_LINES.map(([key, label]) => (
                    <div key={key} className="grid grid-cols-[8rem_minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-2" data-sold-line={key}>
                      <span className="text-sm">{label}</span>
                      <Input inputMode="decimal" placeholder="Premium" value={boxes[key]?.premium ?? ""} onChange={(e) => setBox(key, "premium", e.target.value)}
                        aria-label={`${label} premium`} data-line-premium={key} />
                      <Select value={boxes[key]?.carrier ?? ""} onChange={(e) => setBox(key, "carrier", e.target.value)} aria-label={`${label} carrier placed with`} data-line-carrier={key}>
                        <option value="">Carrier placed with…</option>
                        {carriers.map((c) => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2 text-sm" data-total-premium>
                  <span className="font-medium">Total premium</span>
                  <strong className="tabular-nums">{money(total)}</strong>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">The total counts in your Sale Pipeline as Premium Written.</p>
                {fe("lines") ? <p className="mt-1 text-xs text-destructive">{fe("lines")}</p> : null}
              </div>
            ) : null}

            {status ? (
              <Field label="Notes" error={fe("note")} hint="Why you updated it, and what happened. Your name and the day go with it.">
                <StampedTextarea name="note" rows={4} maxLength={2000} aria-invalid={invalid("note")} data-update-note />
              </Field>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || !status} data-save-update>{pending ? "Saving…" : "Save update"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
