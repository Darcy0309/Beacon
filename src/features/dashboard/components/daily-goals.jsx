"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveDailyGoals } from "@/features/dashboard/actions";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/** One line: what, a slim bar, "3 / 5 60%" (or how many so far with no goal). */
function Progress({ label, done, goal, color }) {
  const pct = goal ? Math.min(100, Math.round((done / goal) * 100)) : null;
  return (
    <div data-goal={label.toLowerCase()} className="flex items-center gap-2 text-xs">
      <span className="w-12 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        {goal ? <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} /> : null}
      </div>
      <span className="shrink-0 font-semibold tabular-nums">
        {done}{goal ? ` / ${goal}` : ""}
        {pct != null ? <span className={cn("ml-1", pct >= 100 ? "text-emerald-400" : "text-muted-foreground")}>{pct}%</span> : null}
      </span>
    </div>
  );
}

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
 * Today's goals on the Daily Production tile: set as the day starts (how
 * many leads and appointments), then tracked as the % reached. `today`:
 * { leads, appts, leadsGoal, apptsGoal }.
 */
export default function DailyGoals({ today, accent }) {
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

  if (editing || !hasGoal) {
    return (
      <form action={action} className="mt-2 space-y-1.5" data-daily-goals-form>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{hasGoal ? "Change today's goal" : "Set today's goal"}</span>
          {hasGoal ? <button type="button" onClick={() => setEditing(false)} className="hover:text-primary">Cancel</button> : null}
        </div>
        {/* Labels inside the boxes: one row, so the tile is no taller than the others. */}
        <div className="flex items-center gap-2">
          <GoalInput name="leads_goal" label="Leads" defaultValue={today.leadsGoal} invalid={state?.fieldErrors?.leads_goal} />
          <GoalInput name="appts_goal" label="Appts" defaultValue={today.apptsGoal} invalid={state?.fieldErrors?.appts_goal} />
          <Button type="submit" size="sm" className="h-8" disabled={pending}><Target /> {pending ? "…" : "Set"}</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-2 space-y-1.5" data-daily-goals>
      {/* In the tile's top right corner: changing the goal takes no line of its own. */}
      <button type="button" onClick={() => setEditing(true)} aria-label="Change today's goal" title="Change today's goal" data-change-goal
        className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary">
        <Pencil className="size-3.5" />
      </button>
      <Progress label="Leads" done={today.leads} goal={today.leadsGoal} color={accent} />
      <Progress label="Appts" done={today.appts} goal={today.apptsGoal} color={accent} />
    </div>
  );
}
