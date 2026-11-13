"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Trophy } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveBonusPlans } from "@/features/pay/extras-actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const ROWS = 4;

const PLANS = [
  { key: "lead_weekly", title: "Lead manager · each half of a pay period", count: "units", note: "Paid on that pay period's check." },
  { key: "appt_weekly", title: "Appointment manager · each half of a pay period", count: "valid appts", note: "Appointments set in the half, less any found invalid: paid on the next pay period's check." },
  { key: "appt_monthly", title: "Appointment manager · each month", count: "valid appts", note: "Appointments set in the month, less any found invalid: paid once a tier is reached and those appointments' dates have passed." },
];

/**
 * Settings › Bonus plans (Sean, Nov 2026): the tiers of each plan, what a lead manager's units are made
 * of, and how many days a pay period's first half is. Each manager's plan is on their user form.
 * `rules`: bonus_rules().
 */
export default function BonusPlansSettings({ rules }) {
  const [state, action, pending] = useActionState(saveBonusPlans, EMPTY);
  useEffect(() => {
    if (state.ok) toast.success("Bonus plans saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  const saved = state.ok ? state.data : rules;
  return (
    <Card data-bonus-plans>
      <SectionHeader label="Bonus Plans" icon={Trophy} />
      <form key={JSON.stringify(saved)} action={action} className="space-y-5 p-5">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Bonuses are added to each manager&apos;s pay on the Pay report, on top of their pay. The highest tier reached counts.
          Each manager&apos;s plan is set on their user form (Users).
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((p) => (
            <fieldset key={p.key} className="space-y-2 rounded-lg border border-[var(--panel-border)] p-3" data-bonus-plan-tiers={p.key}>
              <legend className="px-1 text-xs font-semibold">{p.title}</legend>
              {Array.from({ length: ROWS }, (_, i) => {
                const t = saved?.[p.key]?.[i];
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Input name={`${p.key}_at_${i}`} type="number" min={1} defaultValue={t?.at ?? ""} placeholder="—" className="w-20" aria-label={`Tier ${i + 1}: ${p.count}`} />
                    <span className="text-xs text-muted-foreground">{p.count} =</span>
                    <span className="text-muted-foreground">$</span>
                    <Input name={`${p.key}_amount_${i}`} inputMode="decimal" defaultValue={t?.amount ?? ""} placeholder="—" className="w-24" aria-label={`Tier ${i + 1}: bonus`} />
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">{p.note}</p>
              {state.fieldErrors?.[p.key] ? <p role="alert" className="text-xs font-medium text-destructive">{state.fieldErrors[p.key]}</p> : null}
            </fieldset>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">First half of a pay period</span>
            <span className="flex items-center gap-2"><Input name="first_days" type="number" min={1} max={30} defaultValue={saved?.first_days ?? 5} className="w-20" /> days</span>
          </label>
          {[["lead", "Lead"], ["appointment", "Appointment"], ["dec_sheet", "Dec sheet"]].map(([k, label]) => (
            <label key={k} className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{label} = units</span>
              <Input name={`unit_${k}`} type="number" min={0} max={100} step="0.5" defaultValue={saved?.units?.[k] ?? ""} className="w-20" />
            </label>
          ))}
          <label className="flex max-w-sm cursor-pointer items-start gap-2">
            <input type="checkbox" name="monthly_total" defaultChecked={saved?.monthly_total !== false} className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span className="text-xs text-muted-foreground">A monthly tier&apos;s amount is the whole bonus ($500 at 150 is $200 more after the $300 at 100). Unticked: each tier is paid in full.</span>
          </label>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Card>
  );
}
