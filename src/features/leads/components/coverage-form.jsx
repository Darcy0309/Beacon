"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
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

/**
 * Edit a name's coverage from the Coverage tab: its Ultimate X-Date, the
 * prospect's agency, and each policy line's X-date and carrier, the carrier
 * suggested from the Insurance Cos. list as it is typed.
 */
export default function CoverageForm({ leadId, company, coverage, carriers }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveCoverage, EMPTY);
  const { fe, invalid, dv } = formHelpers(state, coverage);
  const problem = state?.error && !state?.fieldErrors ? state.error : null;

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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Ultimate XDate" error={fe("ultimate_xdate")}>
                <DatePicker name="ultimate_xdate" defaultValue={dv("ultimate_xdate")} invalid={invalid("ultimate_xdate")} aria-label="Ultimate XDate" placeholder="e.g. 3/1/27 or Mar 1" />
              </Field>
              <Field label="Agency" error={fe("agency_name")} hint="The prospect's insurance agency">
                <Input name="agency_name" maxLength={120} defaultValue={dv("agency_name")} aria-invalid={invalid("agency_name")} />
              </Field>
            </div>

            <div className="rounded-lg border border-[var(--panel-border)]">
              <div className="hidden grid-cols-[7.5rem_13.5rem_1fr] gap-3 border-b border-[var(--panel-border)] px-3 py-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
                <span>Policy line</span><span>X-Date</span><span>Carrier</span>
              </div>
              <div className="divide-y divide-[var(--panel-border)]">
                {POLICY_LINES.map((line) => (
                  <div key={line.key} data-coverage-line={line.key} className="grid grid-cols-1 items-start gap-2 px-3 py-2.5 sm:grid-cols-[7.5rem_13.5rem_1fr] sm:gap-3">
                    <span className="pt-2 text-sm font-medium">{line.label}</span>
                    <div>
                      <DatePicker name={line.date} defaultValue={dv(line.date)} invalid={invalid(line.date)} aria-label={`${line.label} X-Date`} placeholder="X-date" />
                      {fe(line.date) ? <p role="alert" className="mt-1 text-[0.7rem] font-medium text-destructive">{fe(line.date)}</p> : null}
                    </div>
                    <SuggestInput name={line.carrier} defaultValue={dv(line.carrier)} options={carriers} invalid={invalid(line.carrier)}
                      aria-label={`${line.label} carrier`} placeholder="Carrier" />
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
