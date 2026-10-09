import { Gauge } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { addDays, formatIso } from "@/lib/dates";
import { hoursLabel } from "@/lib/pay";
import { cn } from "@/lib/utils";
import DailyGoals from "@/features/dashboard/components/daily-goals";

const LEADS = "var(--neon-cyan)";
const APPTS = "var(--neon-emerald)";

/** How many, against the goal: "4 of 5 · 80%" and a bar; or that no goal was set. */
function Meter({ label, done, goal, color, plural }) {
  const pct = goal ? Math.round((done / goal) * 100) : null;
  return (
    <div data-meter={label.toLowerCase()}>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums" style={{ color }}>{done}</span>
        <span className="text-xs text-muted-foreground">
          {goal ? <>of {goal} · <span className={cn("font-semibold", pct >= 100 ? "text-emerald-400" : "text-foreground")}>{pct}%</span></> : plural ? "no goals set" : "no goal set"}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        {goal ? <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, pct)}%`, background: color }} /> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, muted }) {
  return (
    <div className="px-4 py-3 text-center">
      <div className={cn("text-base font-semibold tabular-nums", muted && "text-muted-foreground")}>{value}</div>
      <div className="mt-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    </div>
  );
}

/** Leads and appointments day by day across a week, pay period or month (or the week up to a day, `mark`ed). */
function DayBars({ days, from, to, mark, caption }) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const list = [];
  for (let d = from; d <= to && list.length < 62; d = addDays(d, 1)) list.push(d);
  const most = Math.max(1, ...list.map((d) => (byDay.get(d)?.leads ?? 0) + (byDay.get(d)?.appts ?? 0)));
  return (
    <div className="px-5 pb-4" data-day-bars>
      <div className="flex h-16 items-end gap-[3px]">
        {list.map((d) => {
          const r = byDay.get(d);
          const leads = r?.leads ?? 0;
          const appts = r?.appts ?? 0;
          return (
            <div key={d} className={cn("flex h-full min-w-0 flex-1 flex-col justify-end rounded-sm bg-muted/40", d === mark && "ring-1 ring-primary/60")}
              title={`${formatIso(d, "long")}: ${leads} lead${leads === 1 ? "" : "s"}, ${appts} appointment${appts === 1 ? "" : "s"}`}>
              {appts ? <div className="rounded-t-sm" style={{ height: `${(appts / most) * 100}%`, background: APPTS }} /> : null}
              {leads ? <div className={cn(!appts && "rounded-t-sm")} style={{ height: `${(leads / most) * 100}%`, background: LEADS }} /> : null}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        <span>{caption ?? formatIso(from, "short")}</span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: LEADS }} /> Leads</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: APPTS }} /> Appts</span>
        </span>
        <span>{mark ? "" : formatIso(to, "short")}</span>
      </div>
    </div>
  );
}

/**
 * The manager's own production (row two of their dashboard): the leads and
 * appointments they developed on a day (today by default) or over a pay
 * period, week or month, against the goals they set; the hours worked
 * (from their work day, as Pay & Hours counts it), calls, and when they
 * started. Today's goal is set here as the day begins.
 *
 *   person    getProduction()'s row for them (null: nothing yet); for a
 *             day, over the week up to it, which the bars show
 *   view      readView(): the period and its days
 *   today     their day so far, for the goal form
 *   switcher  the period switch; nav  the day navigator
 */
export default function ProductionCard({ person, view, today, switcher, nav, timeZone }) {
  const all = person ?? { leads: 0, appts: 0, calls: 0, workedMinutes: 0, leadsGoal: null, apptsGoal: null, daysWorked: 0, starts: [], days: [] };
  const isDay = view.key === "day";
  // A day: its own figures, out of the week loaded with it.
  const d = isDay ? all.days.find((x) => x.day === view.anchor) : null;
  const p = isDay
    ? { leads: d?.leads ?? 0, appts: d?.appts ?? 0, calls: d?.calls ?? 0, workedMinutes: d?.workedMinutes ?? 0,
        leadsGoal: d?.leadsGoal ?? null, apptsGoal: d?.apptsGoal ?? null, starts: d?.startedAt ? [d.startedAt] : [], days: all.days }
    : all;
  const isToday = isDay && view.anchor === view.today;
  const started = p.starts[0]
    ? new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(p.starts[0]))
    : null;

  return (
    <Card id="daily-production" data-production-card className="flex scroll-mt-4 flex-col">
      <SectionHeader wrap label="Daily Production" icon={Gauge} action={switcher} />
      <div className="flex items-center justify-between gap-2 px-5 pt-3">
        <span className="text-xs text-muted-foreground">{isDay ? (isToday ? "So far today" : "That day") : `${p.daysWorked} day${p.daysWorked === 1 ? "" : "s"} worked`}</span>
        {nav}
      </div>
      <div className="grid grid-cols-2 gap-5 px-5 py-4">
        <Meter label="Leads" done={p.leads} goal={p.leadsGoal} color={LEADS} plural={!isDay} />
        <Meter label="Appointments" done={p.appts} goal={p.apptsGoal} color={APPTS} plural={!isDay} />
      </div>
      {isToday ? (
        <div className="px-5 pb-4">
          <DailyGoals today={today} mode="card" />
        </div>
      ) : null}
      {isDay
        ? <div className="mt-auto pt-2"><DayBars days={p.days} from={addDays(view.anchor, -6)} to={view.anchor} mark={view.anchor} caption="The last 7 days" /></div>
        : <DayBars days={p.days} from={view.range.from} to={view.through} />}
      <div className="mt-auto grid grid-cols-3 divide-x divide-[var(--panel-border)] border-t border-[var(--panel-border)]">
        <Stat label="Hours worked" value={hoursLabel(p.workedMinutes)} />
        <Stat label="Calls" value={p.calls} />
        {isDay
          ? <Stat label="Started" value={started ?? (isToday ? "Not yet" : "—")} muted={!started} />
          : <Stat label="Days worked" value={p.daysWorked} />}
      </div>
    </Card>
  );
}
