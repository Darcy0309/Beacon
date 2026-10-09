"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyCheck, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import DatePicker from "@/components/shared/date-picker";
import SuggestInput from "@/components/shared/suggest-input";
import { saveCoverage } from "@/features/leads/actions";
import { POLICY_LINES } from "@/lib/coverage";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
// The lines "apply to all" fills in: most of the time they renew together, as the client put it.
const SHARED = ["pkg", "wc", "auto"];
const sharedLabel = POLICY_LINES.filter((l) => SHARED.includes(l.key)).map((l) => l.label);
const listed = (a) => `${a.slice(0, -1).join(", ")} & ${a.at(-1)}`;

/**
 * Edit a name's coverage from the Coverage tab: its Ultimate X-Date, the
 * prospect's agency and how long they have been with it, and each policy
 * line's X-date and carrier, the carrier suggested from the Insurance Cos.
 * list as it is typed. Dates are typed (MM/DD/YYYY or the like) or picked
 * from a calendar, and a date that is not one is pointed out. Most of the
 * time the main policies renew together with one carrier, so the Ultimate
 * X-Date and the liability carrier can each be applied to liability,
 * workers comp and auto at once.
 */
export default function CoverageForm({ leadId, company, coverage, carriers }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveCoverage, EMPTY);
  const { fe, invalid, dv } = formHelpers(state, coverage);
  const problem = state?.error && !state?.fieldErrors ? state.error : null;

  // The dates and carriers, held here so "apply to all" can fill them in.
  const start = () => Object.fromEntries([
    ["ultimate_xdate", dv("ultimate_xdate") ?? ""],
    ...POLICY_LINES.flatMap((l) => [[l.date, dv(l.date) ?? ""], [l.carrier, dv(l.carrier) ?? ""]]),
  ]);
  const [vals, setVals] = useState(start);
  const [applied, setApplied] = useState(null);
  useEffect(() => {
    if (open) {
      setVals(start());
      setApplied(null);
    }
    // Only as the dialog opens: what is on file then.
  }, [open]);
  const set = (key) => (v) => setVals((x) => ({ ...x, [key]: v ?? "" }));
  const applyDate = () => {
    setVals((x) => ({ ...x, ...Object.fromEntries(POLICY_LINES.filter((l) => SHARED.includes(l.key)).map((l) => [l.date, x.ultimate_xdate])) }));
    setApplied("date");
  };
  const applyCarrier = () => {
    setVals((x) => ({ ...x, ...Object.fromEntries(POLICY_LINES.filter((l) => SHARED.includes(l.key)).map((l) => [l.carrier, x.pkg_carrier])) }));
    setApplied("carrier");
  };

  useEffect(() => {
    if (state?.ok) {
      toast.success("Coverage saved");
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-edit-coverage><Pencil /> Edit coverage</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Coverage for {company}</DialogTitle>
          <DialogDescription>Type a carrier and pick it from the list, so every name is spelled the same way.</DialogDescription>
        </DialogHeader>

        <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          <input type="hidden" name="lead_id" value={leadId} />
          <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1 pb-1">
            {problem ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{problem}</p>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_8rem]">
              <Field label="Ultimate XDate" error={fe("ultimate_xdate")}>
                <DatePicker name="ultimate_xdate" value={vals.ultimate_xdate} onChange={set("ultimate_xdate")} invalid={invalid("ultimate_xdate")} aria-label="Ultimate XDate" placeholder="MM/DD/YYYY, or pick it" />
                <button type="button" onClick={applyDate} disabled={!vals.ultimate_xdate} data-apply-date
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary transition-opacity hover:underline disabled:pointer-events-none disabled:opacity-40">
                  <CopyCheck className="size-3.5" /> Apply date to {listed(sharedLabel)}
                </button>
              </Field>
              <Field label="Agency" error={fe("agency_name")} hint="The prospect's insurance agency">
                <Input name="agency_name" maxLength={120} defaultValue={dv("agency_name")} aria-invalid={invalid("agency_name")} />
              </Field>
              <Field label="Years with agency" error={fe("agency_years")}>
                <Input name="agency_years" type="number" inputMode="numeric" min="0" max="150" defaultValue={dv("agency_years")} aria-invalid={invalid("agency_years")} />
              </Field>
            </div>
            {applied ? (
              <p role="status" className="-mt-2 text-xs text-emerald-600 dark:text-emerald-400" data-applied>
                {applied === "date" ? "The Ultimate X-Date" : "The liability carrier"} is filled in for {listed(sharedLabel)}: save to keep it.
              </p>
            ) : null}

            <div className="rounded-lg border border-[var(--panel-border)]">
              <div className="hidden grid-cols-[7.5rem_13.5rem_1fr] gap-3 border-b border-[var(--panel-border)] px-3 py-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
                <span>Policy line</span><span>X-Date</span><span>Carrier</span>
              </div>
              <div className="divide-y divide-[var(--panel-border)]">
                {POLICY_LINES.map((line) => (
                  <div key={line.key} data-coverage-line={line.key} className="grid grid-cols-1 items-start gap-2 px-3 py-2.5 sm:grid-cols-[7.5rem_13.5rem_1fr] sm:gap-3">
                    <span className="pt-2 text-sm font-medium">{line.label}</span>
                    <div>
                      <DatePicker name={line.date} value={vals[line.date]} onChange={set(line.date)} invalid={invalid(line.date)} aria-label={`${line.label} X-Date`} placeholder="MM/DD/YYYY" />
                      {fe(line.date) ? <p role="alert" className="mt-1 text-[0.7rem] font-medium text-destructive">{fe(line.date)}</p> : null}
                    </div>
                    <div className="min-w-0">
                      <SuggestInput name={line.carrier} value={vals[line.carrier]} onChange={set(line.carrier)} options={carriers} invalid={invalid(line.carrier)}
                        aria-label={`${line.label} carrier`} placeholder="Carrier" />
                      {line.key === SHARED[0] ? (
                        <button type="button" onClick={applyCarrier} disabled={!vals[line.carrier]?.trim()} data-apply-carrier
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary transition-opacity hover:underline disabled:pointer-events-none disabled:opacity-40">
                          <CopyCheck className="size-3.5" /> Apply carrier to {listed(sharedLabel.slice(1).length > 1 ? sharedLabel.slice(1) : sharedLabel)}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save coverage"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
