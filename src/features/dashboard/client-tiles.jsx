import { UPDATE_STATUSES } from "@/lib/appointment-updates";
import { CalendarCheck, ClipboardList, Target, TrendingUp } from "lucide-react";
import { addDays, addMonths } from "@/lib/dates";

/**
 * The client dashboard's top row (Sean, Oct 2026), shaped for StatTile: the
 * client's own dashboard has all four; an administrator's view of a client
 * has 3 and 4, the same figures.
 */

/** Tiles 1 and 2 count over these (the address's ?cp=); all time to begin with. */
export const CLIENT_PERIODS = [["1w", "1 Wk"], ["1m", "1 Mo"], ["3m", "3 Mo"], ["6m", "6 Mo"], ["all", "All"]];
/** Tile 4 looks this many months ahead (?up=); three to begin with. */
export const PIPELINE_PERIODS = [["3", "3 Mo"], ["6", "6 Mo"]];

export const clientPeriod = (v) => (CLIENT_PERIODS.some(([k]) => k === v) ? v : "all");
export const pipelineMonths = (v) => (v === "6" ? 6 : 3);

/** The first day a period counts from ("YYYY-MM-DD"), null for all time. */
export function clientPeriodFrom(key, today) {
  if (key === "1w") return addDays(today, -6);
  if (key === "1m") return addMonths(today, -1);
  if (key === "3m") return addMonths(today, -3);
  if (key === "6m") return addMonths(today, -6);
  return null;
}

/** The outcomes a client records on an appointment, in Sean's order. */
// How their appointments went, in the statuses they give them (Appointments › Update status):
// still to come first, then the ones gone by with no status yet.
export const CLIENT_RESULTS = [
  ...UPDATE_STATUSES.filter(([k]) => k === "pending_appointment"),
  ...UPDATE_STATUSES.filter(([k]) => k !== "pending_appointment"),
];

/** Tile 1: the leads developed for them (never the names still to call), and each DB dev project's. */
export function leadsTile(d, action) {
  return {
    label: "Leads Developed", value: d.leads.toLocaleString(), icon: Target, accent: "var(--neon-cyan)", action,
    note: d.projects.length === 1 ? "from 1 DB dev project" : `from ${d.projects.length} DB dev projects`,
    children: (
      <ul className="mt-2 space-y-1 text-xs" data-client-projects>
        {d.projects.slice(0, 4).map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-muted-foreground" title={p.name}>{p.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{p.leads.toLocaleString()}</span>
          </li>
        ))}
        {d.projects.length > 4 ? <li className="text-muted-foreground">+{d.projects.length - 4} more</li> : null}
      </ul>
    ),
  };
}

/** Tile 2: appointments set, as a share of the leads. */
export function appointmentsTile(d, action) {
  return {
    label: "Appointments Set", value: d.appts.toLocaleString(), icon: CalendarCheck, accent: "var(--neon-emerald)", action,
    note: <span data-client-appt-pct>{`${d.pct}% of leads`}</span>,
  };
}

/** Tile 3: each appointment's outcome, as the client records it. */
export function resultsTile(results) {
  const total = CLIENT_RESULTS.reduce((s, [k]) => s + Number(results?.[k] ?? 0), 0);
  return {
    label: "Appointment Results", value: total.toLocaleString(), icon: ClipboardList, accent: "var(--neon-violet)",
    note: "as you update them",
    children: (
      <ul className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-2" data-client-results>
        {CLIENT_RESULTS.map(([k, label, color]) => (
          <li key={k} className="flex items-center justify-between gap-2" data-client-result={k}>
            <span className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />{label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{Number(results?.[k] ?? 0).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    ),
  };
}

/** Tile 4: viable leads renewing in each month ahead ("Nov 52 · Dec 64 · Jan 100"). */
export function pipelineTile(months, action) {
  const total = months.reduce((s, m) => s + m.leads, 0);
  return {
    label: "Upcoming Pipeline", value: total.toLocaleString(), icon: TrendingUp, accent: "var(--neon-amber)", action,
    note: `viable leads, next ${months.length} months`,
    series: months.map((m) => m.leads), bars: true,
    children: (
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" data-client-pipeline>
        {months.map((m) => (
          <li key={m.key} data-pipeline-month={m.key}>
            <span className="text-muted-foreground">{m.label}</span> <span className="font-semibold tabular-nums">{m.leads.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    ),
  };
}
