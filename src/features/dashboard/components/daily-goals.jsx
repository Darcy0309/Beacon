"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveDailyGoals } from "@/features/dashboard/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/** A number box with its label inside, on the left. */
function GoalInput({ name, label, defaultValue, invalid }) {
  return (
    <label className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[0.68rem] text-muted-foreground">{label}</span>
      <Input name={name} type="number" inputMode="numeric" min="0" max="1000" defaultValue={defaultValue ?? ""}
        className="h-8 pl-10 pr-1 tabular-nums" aria-invalid={Boolean(invalid)} />
    </label>
  );
}

/**
 * Today's goals on the Daily Production card: how many leads and
 * appointments the manager means to develop, set as the day starts (the
 * card's meters track the % reached), and changed there. `today`:
 * { leadsGoal, apptsGoal }. `readOnly`: an administrator looking on.
 */
export default function DailyGoals({ today, readOnly = false }) {
  const hasGoal = today.leadsGoal != null || today.apptsGoal != null;
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(saveDailyGoals, EMPTY);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Today's goal is set");
      setEditing(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, router]);

  if (readOnly) {
    return hasGoal ? null : <p className="text-xs text-muted-foreground" data-no-goal>No goal set for today yet.</p>;
  }

  if (editing || !hasGoal) {
    return (
      <form action={action} className="space-y-1.5" data-daily-goals-form>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{hasGoal ? "Change today's goal" : "Set today's goal: what you mean to develop today"}</span>
          {hasGoal ? <button type="button" onClick={() => setEditing(false)} className="hover:text-primary">Cancel</button> : null}
        </div>
        {/* Labels inside the boxes: one row. */}
        <div className="flex items-center gap-2">
          <GoalInput name="leads_goal" label="Leads" defaultValue={today.leadsGoal} invalid={state?.fieldErrors?.leads_goal} />
          <GoalInput name="appts_goal" label="Appts" defaultValue={today.apptsGoal} invalid={state?.fieldErrors?.appts_goal} />
          <Button type="submit" size="sm" className="h-8" disabled={pending}><Target /> {pending ? "…" : "Set"}</Button>
        </div>
      </form>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} data-change-goal
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary">
      <Pencil className="size-3" /> Change today&apos;s goal
    </button>
  );
}
