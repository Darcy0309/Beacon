"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select, formHelpers } from "@/components/ui/field";
import SectionHeader from "@/components/shared/section-header";
import DatePicker from "@/components/shared/date-picker";
import { savePayRules } from "@/features/pay/actions";
import { PAY_PERIODS, RATE_KINDS, ROUNDING, usd } from "@/lib/pay";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const ROUND_TO = ["5", "6", "10", "15", "30", "60"];

/** A dollar amount. Each is written out by name in the form, so the form-schema check sees every field. */
function Money({ name, label, h }) {
  return (
    <Field label={label} error={h.fe(name)}>
      <Input name={name} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={h.dv(name)} aria-invalid={h.invalid(name)} />
    </Field>
  );
}

/**
 * Settings › Pay & time. The ranges each project rate is picked from (so a
 * higher rate later is a change here, not new code), the hourly range for
 * hybrid pay, how time worked is counted, and the pay period.
 */
export default function PayRulesForm({ rules }) {
  const [state, formAction, pending] = useActionState(savePayRules, EMPTY);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Pay and time rules saved");
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, router]);

  const { rates, time } = rules;
  const record = {
    ...Object.fromEntries(
      ["lead", "appointment", "special", "hourly"].flatMap((k) => [
        [`${k}_min`, rates[k].min.toFixed(2)],
        [`${k}_max`, rates[k].max.toFixed(2)],
        [`${k}_step`, rates[k].step.toFixed(2)],
      ])
    ),
    idle_minutes: String(time.idle_minutes),
    call_minutes: String(time.call_minutes),
    rounding: time.rounding,
    round_to: String(time.round_to),
    pay_period: time.pay_period,
    period_start: time.period_start,
  };
  const helpers = formHelpers(state, record);
  const { fe, invalid, dv } = helpers;
  const hint = (key) => RATE_KINDS.find(([k]) => k === key);

  return (
    <form action={formAction} noValidate className="space-y-4" data-pay-rules>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader label="Pay Rates" icon={Banknote} />
          <div className="space-y-5 p-5">
            <p className="text-sm text-muted-foreground">
              The rates an administrator picks from for each project, and the hourly rates for hybrid pay. To pay more
              later, widen a range here; no other change is needed.
            </p>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{hint("lead")[2]}</legend>
              <p className="text-xs text-muted-foreground">{hint("lead")[3]}</p>
              <div className="grid grid-cols-3 gap-3">
                <Money h={helpers} name="lead_min" label="From ($)" />
                <Money h={helpers} name="lead_max" label="To ($)" />
                <Money h={helpers} name="lead_step" label="In steps of ($)" />
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{hint("appointment")[2]}</legend>
              <p className="text-xs text-muted-foreground">{hint("appointment")[3]}</p>
              <div className="grid grid-cols-3 gap-3">
                <Money h={helpers} name="appointment_min" label="From ($)" />
                <Money h={helpers} name="appointment_max" label="To ($)" />
                <Money h={helpers} name="appointment_step" label="In steps of ($)" />
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{hint("special")[2]}</legend>
              <p className="text-xs text-muted-foreground">{hint("special")[3]}</p>
              <div className="grid grid-cols-3 gap-3">
                <Money h={helpers} name="special_min" label="From ($)" />
                <Money h={helpers} name="special_max" label="To ($)" />
                <Money h={helpers} name="special_step" label="In steps of ($)" />
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Hourly rate (hybrid pay)</legend>
              <p className="text-xs text-muted-foreground">Set on each account manager&apos;s profile, within this range.</p>
              <div className="grid grid-cols-3 gap-3">
                <Money h={helpers} name="hourly_min" label="From ($)" />
                <Money h={helpers} name="hourly_max" label="To ($)" />
              </div>
            </fieldset>
          </div>
        </Card>

        <Card>
          <SectionHeader label="Time Worked & Pay Period" icon={Timer} />
          <div className="space-y-4 p-5">
            <p className="text-sm text-muted-foreground">
              Time counts while someone works in Lighthouse: clicks and key presses on their lists, lead sheets and
              results. Being signed in, or moving the mouse, does not count.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Stop the timer after (minutes idle)" error={fe("idle_minutes")} hint="With no click or key press for this long, the time does not count.">
                <Input name="idle_minutes" type="number" inputMode="numeric" min="1" max="60" step="1" defaultValue={dv("idle_minutes")} aria-invalid={invalid("idle_minutes")} />
              </Field>
              <Field label="A call counts for up to (minutes)" error={fe("call_minutes")} hint="From pressing Call now to saving the result, as a call has no clicks. 0 turns this off.">
                <Input name="call_minutes" type="number" inputMode="numeric" min="0" max="240" step="1" defaultValue={dv("call_minutes")} aria-invalid={invalid("call_minutes")} />
              </Field>
              <Field label="Rounding" error={fe("rounding")}>
                <Select name="rounding" defaultValue={dv("rounding")} aria-invalid={invalid("rounding")}>
                  {ROUNDING.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label="To the next (minutes)" error={fe("round_to")} hint="With hourly rounding, one click in an hour counts as this long.">
                <Select name="round_to" defaultValue={dv("round_to")} aria-invalid={invalid("round_to")}>
                  {ROUND_TO.map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </Select>
              </Field>
              <Field label="Pay period" error={fe("pay_period")}>
                <Select name="pay_period" defaultValue={dv("pay_period")} aria-invalid={invalid("pay_period")}>
                  {PAY_PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label="A pay period starts on" error={fe("period_start")} hint="Any first day of a period; weekly and two-weekly periods count from it. A custom schedule uses the Pay Periods list below.">
                <DatePicker name="period_start" defaultValue={dv("period_start")} invalid={invalid("period_start")} aria-label="A pay period starts on" />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Hybrid pay compares, for each pay period, the hours paid at the person&apos;s rate with their commission
              (lead, appointment and special pay, less chargebacks), and pays the higher. Today the hourly range is{" "}
              {usd(rules.rates.hourly.min)}–{usd(rules.rates.hourly.max)}.
            </p>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save pay rules"}</Button>
      </div>
    </form>
  );
}
