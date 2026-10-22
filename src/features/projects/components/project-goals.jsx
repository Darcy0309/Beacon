import { Goal } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE = { met: "var(--neon-emerald)", "on pace": "var(--neon-cyan)", behind: "var(--neon-amber)" };

/** One goal as a bar: delivered so far, where the goal would have it by today (the tick), and what is owed. */
export function GoalBar({ label, g, compact = false }) {
  const color = TONE[g.status] ?? "var(--neon-blue)";
  return (
    <div data-goal={label} data-goal-status={g.status ?? "none"}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className={cn("font-medium", compact && "text-xs")}>{label}</span>
        <span className="tabular-nums">
          <strong>{g.done.toLocaleString()}</strong>
          <span className="text-muted-foreground"> of {g.goal.toLocaleString()} · {g.pct}%</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-muted" role="img"
        aria-label={`${label}: ${g.done} of ${g.goal}${g.expected != null ? `, ${g.expected} expected by today` : ""}`}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, g.pct)}%`, background: color }} />
        {g.expected != null && g.status !== "met" ? (
          <span className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60" style={{ left: `calc(${Math.min(100, (g.expected / g.goal) * 100)}% - 1px)` }} title={`${g.expected.toLocaleString()} by today, on pace`} />
        ) : null}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {g.status === "met"
          ? g.extra ? `Goal met, ${g.extra.toLocaleString()} over` : "Goal met"
          : [`${g.owed.toLocaleString()} still owed`, g.status === "behind" ? `${(g.expected - g.done).toLocaleString()} behind pace` : g.status === "on pace" ? "on pace" : null].filter(Boolean).join(" · ")}
      </div>
      {/* The goal a month (Sean, Oct 2026): the project's average a month against it, and this month so far. */}
      {g.month ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" data-goal-month={g.month.status ?? "none"}>
          {g.month.avg != null ? (
            <span style={{ color: TONE[g.month.status] }} className="font-semibold tabular-nums">
              Avg {g.month.avg.toLocaleString()} a month · goal {g.month.perMonth.toLocaleString()}{g.month.status ? ` · ${g.month.status}` : ""}
            </span>
          ) : <span className="text-muted-foreground">Goal {g.month.perMonth.toLocaleString()} a month</span>}
          {g.month.thisMonth != null ? (
            <span className="tabular-nums text-muted-foreground">This month {g.month.thisMonth.toLocaleString()} of {g.month.perMonth.toLocaleString()}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A project's goals (the old project dashboard's lead and appointment goals,
 * with days passed and days to go). `leads`, `appts`: goalProgress() for each,
 * or null; `days`: projectDays(). Nothing to show without a goal: `hint` then.
 */
export default function ProjectGoals({ leads, appts, days, hint = null }) {
  if (!leads && !appts && !hint) return null;
  return (
    <Card data-project-goals>
      <SectionHeader label="Goals" icon={Goal} />
      <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        {leads ? <GoalBar label="Leads" g={leads} /> : null}
        {appts ? <GoalBar label="Appointments" g={appts} /> : null}
        {!leads && !appts ? <p className="text-sm text-muted-foreground md:col-span-2">{hint}</p> : null}
        <div className="flex gap-5 text-sm md:flex-col md:gap-1 md:text-right" data-project-days>
          {days.daysPassed != null ? <span><strong className="tabular-nums">{days.daysPassed}</strong> <span className="text-muted-foreground">day{days.daysPassed === 1 ? "" : "s"} passed</span></span> : null}
          {days.daysLeft != null ? <span><strong className="tabular-nums">{days.daysLeft}</strong> <span className="text-muted-foreground">day{days.daysLeft === 1 ? "" : "s"} to go</span></span> : null}
          {days.daysPassed == null && days.daysLeft == null ? <span className="text-xs text-muted-foreground">Set its start and end dates to see its pace.</span> : null}
        </div>
      </div>
    </Card>
  );
}
