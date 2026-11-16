import { Gauge } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { addDays, formatIso } from "@/lib/dates";
import { hoursLabel } from "@/lib/pay";
import { cn } from "@/lib/utils";
import DailyGoals from "@/features/dashboard/components/daily-goals";

// Leads and appointments in the theme's pair of chart colours (globals.css: --series-leads, --series-appts).
const LEADS = "var(--series-leads)";
const APPTS = "var(--series-appts)";

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

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekday = (iso) => WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** "1 of 6 appointments", or "1 appointment" with no goal set. */
const against = (n, goal, word) => (goal ? `${n} of ${goal} ${word}s` : plural(n, word));

/** A day's count of one kind, over its bar: a dot in its colour and the number. */
function Count({ n, color }) {
  return (
    <span className="flex items-center gap-0.5">
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="tabular-nums text-foreground">{n}</span>
    </span>
  );
}

/**
 * Leads and appointments day by day across a week, pay period or month (or the week up to a day, `mark`ed,
 * outlined). Each day is named under its bar (Sean, Nov 2026: "can the days be represented on the bottom");
 * a week's bars carry their numbers over them too, and every bar says them, with the day's goals, on hover.
 */
function DayBars({ days, from, to, mark, caption }) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const list = [];
  for (let d = from; d <= to && list.length < 62; d = addDays(d, 1)) list.push(d);
  const most = Math.max(1, ...list.map((d) => (byDay.get(d)?.leads ?? 0) + (byDay.get(d)?.appts ?? 0)));
  // A week has room for each day's numbers and name; a pay period or month, the date (every other one past 16).
  const roomy = list.length <= 8;
  const dayLabel = (d, i) => {
    if (roomy) return weekday(d);
    if (list.length > 16 && i % 2 && i !== list.length - 1) return "";
    return String(Number(d.slice(8)));
  };
  // A pay period or month has no room for each day's numbers: a scale beside the bars says how tall is how many
  // (Sean, Nov 2026: "#s on the side"): the most in a day at the top, half way when it is a whole number, 0.
  const ticks = roomy ? [] : [most, most % 2 === 0 && most >= 4 ? most / 2 : null, 0].filter((v) => v !== null);
  return (
    <div className="flex gap-1.5 px-5 pb-4" data-day-bars>
      {ticks.length ? (
        <div className="relative h-14 w-4 shrink-0 text-right text-[0.6rem] font-semibold tabular-nums leading-none text-muted-foreground" data-day-scale>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / most) * 100}%` }}>{t}</span>
          ))}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
      <div className="flex gap-[3px]">
        {list.map((d, i) => {
          const r = byDay.get(d);
          const leads = r?.leads ?? 0;
          const appts = r?.appts ?? 0;
          return (
            <div key={d} className="flex min-w-0 flex-1 flex-col items-stretch" data-day={d}
              title={`${formatIso(d, "long")}: ${against(leads, r?.leadsGoal, "lead")}, ${against(appts, r?.apptsGoal, "appointment")}`}>
              {roomy ? (
                <div className="mb-1 flex h-3.5 items-center justify-center gap-1.5 text-[0.65rem] font-semibold" data-day-counts>
                  {leads ? <Count n={leads} color={LEADS} /> : null}
                  {appts ? <Count n={appts} color={APPTS} /> : null}
                </div>
              ) : null}
              <div className={cn("flex h-14 flex-col justify-end overflow-hidden rounded-sm bg-muted/40", d === mark && "ring-1 ring-primary/60")}>
                {appts ? <div className="rounded-t-sm" style={{ height: `${(appts / most) * 100}%`, background: APPTS }} /> : null}
                {leads ? <div className={cn(!appts && "rounded-t-sm")} style={{ height: `${(leads / most) * 100}%`, background: LEADS }} /> : null}
              </div>
              <div className={cn("mt-1 truncate text-center text-[0.6rem] font-semibold text-muted-foreground", d === mark && "text-foreground")} data-day-label>
                {dayLabel(d, i)}
              </div>
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
 *   readOnly  an administrator looking at a manager's: the goal is theirs to set
 */
export default function ProductionCard({ person, view, today, switcher, nav, timeZone, readOnly = false }) {
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
          <DailyGoals today={today} readOnly={readOnly} />
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
