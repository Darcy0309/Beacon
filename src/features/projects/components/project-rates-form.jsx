"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveProjectRates } from "@/features/projects/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

const RATES = [
  ["lead_rate", "Per lead", "A DBDev Lead result: the name promoted to appointment setting"],
  ["appointment_rate", "Per appointment", "An appointment set from a call"],
  ["confirmation_rate", "Per confirmation", "A follow-up call that confirms the appointment"],
];

/**
 * An administrator sets what a project pays its reps, in USD. A chargeback
 * reverses whatever was paid at the time, so changing a rate never changes
 * what has already been earned.
 */
export default function ProjectRatesForm({ project, trigger }) {
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

  const { fe, invalid, dv } = formHelpers(state, {
    lead_rate: project.lead.toFixed(2),
    appointment_rate: project.appointment.toFixed(2),
    confirmation_rate: project.confirmation.toFixed(2),
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
            What a rep earns on this project for each event, in dollars. New events are paid at these rates; what is
            already on the production report keeps the rate it was paid at.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {RATES.map(([name, label, hint]) => (
              <Field key={name} label={label} hint={hint} error={fe(name)}>
                <Input name={name} type="number" inputMode="decimal" step="0.01" min="0" max="10000"
                  defaultValue={dv(name)} aria-invalid={invalid(name)} />
              </Field>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save rates"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
