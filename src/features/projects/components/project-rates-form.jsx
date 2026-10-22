"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "@/components/shared/intent-link";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saveProjectRates } from "@/features/projects/actions";
import { RATE_KINDS, rateOptions, usd } from "@/lib/pay";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * An administrator sets what a project pays, picking each rate from the
 * range in Settings › Pay & time ($0 means that event is not paid on this
 * project). A chargeback reverses whatever was paid at the time, so changing
 * a rate never changes what has already been earned. A DB dev project also
 * has its Special Pay (Sean, Oct 2026): once a rep develops `goal` leads on it
 * in a pay period, each of them, and each after, pays that much more.
 */
export default function ProjectRatesForm({ project, ranges, trigger }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveProjectRates, EMPTY);

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Pay rates saved for ${project.name}`);
      setOpen(false);
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, project.name]);

  const current = { lead_rate: project.lead, appointment_rate: project.appointment, confirmation_rate: project.confirmation };
  const dbdev = project.type === "DBDV";
  const { fe, invalid, dv } = formHelpers(state, {
    ...Object.fromEntries(Object.entries(current).map(([k, v]) => [k, Number(v ?? 0).toFixed(2)])),
    special_goal: project.specialGoal ? String(project.specialGoal) : "",
    special_rate: project.specialGoal ? Number(project.specialRate ?? 0).toFixed(2) : "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm" variant="outline"><Banknote /> Pay rates</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay rates · {project.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={project.id} />
          <p className="text-sm text-muted-foreground">
            What an account manager earns on this project for each event. New events are paid at these rates; what is
            already on the production report keeps the rate it was paid at.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {RATE_KINDS.map(([key, name, label, hint]) => (
              <Field key={name} label={label} hint={hint} error={fe(name)}>
                <Select name={name} defaultValue={dv(name)} aria-invalid={invalid(name)} data-rate={key}>
                  {rateOptions(ranges?.[key], current[name]).map((v) => (
                    <option key={v} value={v.toFixed(2)}>{v === 0 ? "$0.00 · not paid" : usd(v)}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          {dbdev ? (
            <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--panel-border)] p-3" data-special-pay-form>
              <legend className="px-1 text-sm font-medium">Special Pay</legend>
              <p className="text-xs text-muted-foreground">
                When a rep develops this many leads on this project in one pay period, each of those leads, and each one after it that
                period, pays this much more. It shows on their pay as Special Pay. Leave both blank for none.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Goal (leads a pay period)" error={fe("special_goal")}>
                  <Input name="special_goal" type="number" min={1} max={1000} step={1} inputMode="numeric" placeholder="e.g. 5"
                    defaultValue={dv("special_goal")} aria-invalid={invalid("special_goal")} />
                </Field>
                <Field label="Special Pay a lead ($)" error={fe("special_rate")}>
                  <Input name="special_rate" inputMode="decimal" placeholder="e.g. 1.00" defaultValue={dv("special_rate")} aria-invalid={invalid("special_rate")} />
                </Field>
              </div>
            </fieldset>
          ) : null}
          <p className="text-xs text-muted-foreground">
            The choices come from <Link href="/settings" className="text-primary hover:underline">Settings › Pay &amp; time</Link>.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save rates"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
