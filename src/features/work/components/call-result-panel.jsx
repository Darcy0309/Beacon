"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PhoneCall, CalendarCheck, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import SectionHeader from "@/components/shared/section-header";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { recordCallResult } from "@/features/work/actions";
import { APPOINTMENT_TIMES, DURATIONS } from "@/lib/validate";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

// How the buttons are grouped on the sheet.
const GROUPS = [
  { key: "keep", label: "Stays on my list", test: (r) => r.viable && r.callable },
  { key: "win", label: "Lead or appointment", test: (r) => r.effect === "promote" || r.effect === "appointment" },
  { key: "resolve", label: "Takes it off the list", test: (r) => !r.viable || !r.callable },
];

/**
 * The call result buttons on the right of a lead sheet: the results for the
 * lead's project type, and, when the name has an appointment waiting, the
 * confirmation follow-up. Choosing a result shows what it will do (the
 * client's own words) and anything it needs; saving moves on to the next
 * name when the sheet was opened from a call list.
 */
export default function CallResultPanel({ leadId, listId, projectType, results, followUp }) {
  const router = useRouter();
  const [state, setState] = useState(EMPTY);
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState(null);
  const notesRef = useRef(null);
  const { fe, invalid, dv } = formHelpers(state, null);

  const onSheet = useMemo(
    () => results.filter((r) => r.project_type === projectType && r.applies_to === "name"),
    [results, projectType]
  );
  const followUpResults = useMemo(() => {
    if (!followUp) return [];
    const type = followUp.setStage === "dbdev" ? "DBDV" : "APPT";
    return results.filter((r) => r.applies_to === "appointment" && r.project_type === type
      && (r.effect !== "confirm" || !followUp.confirmed));
  }, [results, followUp]);
  const picked = [...onSheet, ...followUpResults].find((r) => r.id === chosen) ?? null;

  // The answer is handled where it is awaited, not in an effect: saving can
  // change the sheet under this panel (a promoted name is no longer the
  // caller's), and the move to the next name must not depend on it staying.
  const submit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await recordCallResult(null, form);
      if (!result?.ok) {
        setState(result ?? EMPTY);
        if (result?.error && !result.fieldErrors) toast.error(result.error);
        return;
      }
      const d = result.data;
      const where = d.promoted ? " — promoted to the appointment project" : d.appointment_id ? " — on the calendar, waiting for QA" : "";
      toast.success(`${d.result} saved${where}`);
      setState(EMPTY);
      setChosen(null);
      if (d.listId) router.push(d.next ? `/leads/${d.next}?project=${d.listId}` : `/work/${d.listId}?done=1`);
      else router.refresh();
    });
  };

  const choose = (id) => {
    setChosen(id);
    requestAnimationFrame(() => notesRef.current?.focus());
  };

  const button = (r) => (
    <button
      key={r.id}
      type="button"
      onClick={() => choose(r.id)}
      aria-pressed={chosen === r.id}
      className={cn(
        "cursor-pointer rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
        chosen === r.id
          ? "border-primary bg-primary/15 text-primary"
          : "border-[var(--panel-border)] bg-muted/30 hover:border-primary/40 hover:text-primary"
      )}
    >
      {r.name}
    </button>
  );

  return (
    <Card>
      <SectionHeader label="Call Result" icon={PhoneCall} />
      <form onSubmit={submit} noValidate className="space-y-4 p-4">
        <input type="hidden" name="lead_id" value={leadId} />
        <input type="hidden" name="result_id" value={chosen ?? ""} />
        {listId ? <input type="hidden" name="project_id" value={listId} /> : null}

        {followUpResults.length ? (
          <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              <CalendarCheck className="size-3.5" /> Appointment {followUp.when}
              {followUp.qa === "pending" ? <span className="font-normal text-muted-foreground">· waiting for QA</span> : null}
            </div>
            <div className="flex flex-wrap gap-1.5">{followUpResults.map(button)}</div>
          </div>
        ) : null}

        {onSheet.length ? (
          GROUPS.map((g) => {
            const items = onSheet.filter((r) => g.test(r) && !(g.key === "resolve" && GROUPS[1].test(r)));
            return items.length ? (
              <div key={g.key}>
                <div className="eyebrow mb-1.5">{g.label}</div>
                <div className="flex flex-wrap gap-1.5">{items.map(button)}</div>
              </div>
            ) : null;
          })
        ) : (
          <p className="text-sm text-muted-foreground">This name is not in a project yet, so there are no results to record.</p>
        )}

        {picked ? (
          <div className="space-y-3 border-t border-[var(--panel-border)] pt-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">{picked.name}:</span> {picked.action}
            </p>

            {picked.effect === "appointment" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" required error={fe("appt_date")}>
                  <Input name="appt_date" type="date" defaultValue={dv("appt_date")} aria-invalid={invalid("appt_date")} />
                </Field>
                <Field label="Time" error={fe("appt_time")}>
                  <Select name="appt_time" defaultValue={dv("appt_time", "10:00 AM")} aria-invalid={invalid("appt_time")}>
                    {APPOINTMENT_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </Field>
                <Field label="Duration" error={fe("duration_min")}>
                  <Select name="duration_min" defaultValue={String(dv("duration_min", "30"))} aria-invalid={invalid("duration_min")}>
                    {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
                  </Select>
                </Field>
                <Field label="Meeting with" hint="The client's producer" error={fe("rep_name")}>
                  <Input name="rep_name" maxLength={80} defaultValue={dv("rep_name")} aria-invalid={invalid("rep_name")} />
                </Field>
              </div>
            ) : null}

            {picked.effect === "correct_xdate" ? (
              <Field label="Corrected renewal date" required error={fe("corrected_xdate")}>
                <Input name="corrected_xdate" type="date" defaultValue={dv("corrected_xdate")} aria-invalid={invalid("corrected_xdate")} />
              </Field>
            ) : null}

            <Field label="Notes" error={fe("notes")}>
              <Textarea ref={notesRef} name="notes" rows={2} maxLength={1000} defaultValue={dv("notes")} aria-invalid={invalid("notes")} />
            </Field>

            {/* Result names run long ("Save: Lead-Not Shopping"). Save sizes to its
                label and Cancel drops below it when both do not fit; a label too
                long for the whole column wraps inside the button. */}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending} className="h-auto min-h-9 min-w-0 shrink grow whitespace-normal py-2 text-left leading-snug">
                {pending ? <Loader2 className="animate-spin" /> : picked.viable && picked.callable ? <CheckCircle2 /> : <XCircle />}
                {pending ? "Saving…" : `Save: ${picked.name}`}
              </Button>
              <Button type="button" variant="outline" onClick={() => setChosen(null)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
