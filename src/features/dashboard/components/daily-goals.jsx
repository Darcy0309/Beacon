"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveDailyGoals } from "@/features/dashboard/actions";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/** "3 / 5 · 60%" with a bar, or how many so far when there is no goal. */
function Progress({ label, done, goal, color }) {
  const pct = goal ? Math.min(100, Math.round((done / goal) * 100)) : null;
  return (
    <div data-goal={label.toLowerCase()}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">
          {done}{goal ? ` / ${goal}` : ""}
          {pct != null ? <span className={cn("ml-1.5", pct >= 100 ? "text-emerald-400" : "text-muted-foreground")}>{pct}%</span> : null}
        </span>
      </div>
      {goal ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
        </div>
      ) : null}
    </div>
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
      <form action={action} className="mt-3 space-y-2" data-daily-goals-form>
        <div className="text-xs text-muted-foreground">{hasGoal ? "Change today's goal" : "Set today's goal"}</div>
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-[0.68rem] text-muted-foreground">
            Leads
            <Input name="leads_goal" type="number" inputMode="numeric" min="0" max="1000" defaultValue={today.leadsGoal ?? ""}
              className="mt-0.5 h-8" aria-invalid={Boolean(state?.fieldErrors?.leads_goal)} />
          </label>
          <label className="min-w-0 flex-1 text-[0.68rem] text-muted-foreground">
            Appointments
            <Input name="appts_goal" type="number" inputMode="numeric" min="0" max="1000" defaultValue={today.apptsGoal ?? ""}
              className="mt-0.5 h-8" aria-invalid={Boolean(state?.fieldErrors?.appts_goal)} />
          </label>
          <Button type="submit" size="sm" className="h-8" disabled={pending}><Target /> {pending ? "…" : "Set"}</Button>
        </div>
        {hasGoal ? (
          <button type="button" onClick={() => setEditing(false)} className="text-[0.68rem] text-muted-foreground hover:text-primary">Cancel</button>
        ) : null}
      </form>
    );
  }

  return (
    <div className="mt-3 space-y-2" data-daily-goals>
      <Progress label="Leads" done={today.leads} goal={today.leadsGoal} color={accent} />
      <Progress label="Appointments" done={today.appts} goal={today.apptsGoal} color={accent} />
      <button type="button" onClick={() => setEditing(true)} className="text-[0.68rem] text-muted-foreground transition-colors hover:text-primary" data-change-goal>
        Change today&apos;s goal
      </button>
    </div>
  );
}
