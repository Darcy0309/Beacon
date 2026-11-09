import Link from "@/components/shared/intent-link";
import ReportChart from "@/components/shared/report-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Bottom to top in each column. Off the list is every name resolved (Sean, Nov 2026: as the
// Pipeline by Month counts it): the appointments at the foot, the rest of it above them, in grey;
// the grey opens all of it, the green the appointments alone.
const SEGMENTS = [
  { key: "appointment", bucket: "appointment", label: "Appointments", color: "var(--chart-win)" },
  { key: "off", bucket: "resolved", label: "Off the list", color: "var(--chart-done)" },
  { key: "viable", bucket: "viable", label: "Viable left", color: "var(--chart-viable)" },
];
// Left to right in the table: off the list (with the appointments), the appointments among them, viable.
const COLUMNS = [
  { key: "resolved", label: "Off the list" },
  { key: "appointment", label: "Appointments" },
  { key: "viable", label: "Viable left" },
];
const FIGURES = ["total", "appointment", "off", "resolved", "viable"];

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

/** Each month's figures for its tooltip: viable, off the list, and the appointments among them, each with its share; the total. */
const monthTips = (months) =>
  Object.fromEntries(months.map((m) => [m.month, {
    title: m.label,
    rows: [
      { key: "viable", label: "Viable left", color: "var(--chart-viable)", value: m.viable.toLocaleString(), share: `${pct(m.viable, m.total)}%` },
      { key: "off", label: "Off the list", color: "var(--chart-done)", value: m.resolved.toLocaleString(), share: `${pct(m.resolved, m.total)}%` },
      { key: "appointment", label: "· Appointments", color: "var(--chart-win)", value: m.appointment.toLocaleString(), share: `${pct(m.appointment, m.total)}%` },
    ],
    total: m.total.toLocaleString(),
    foot: m.total ? "Click a colour to see those names" : null,
  }]));

/**
 * Renewals per month of the year, as stacked columns and as a table. Every
 * number is a link to the names behind it: `href(month, bucket)` builds it (none without `href`)
 * (bucket null for the month's total). `selected` marks the one open.
 * `compact` draws the columns only, for the project page. `today` (the
 * business's "YYYY-MM-DD") marks the current month; the server's own clock
 * runs on UTC, a month ahead on the last evening of one.
 */
export default function XdateMonths({ data, href, selected, today, compact = false, only = null }) {
  const { months, undated } = data;
  // Renewal months picked (X-Dates filters; Sean, Oct 2026): the others faded on the chart, left out of the table and its totals.
  const picked = only?.length ? new Set(only) : null;
  const counted = picked ? months.filter((m) => picked.has(m.month)) : months;
  const totals = picked
    ? Object.fromEntries(FIGURES.map((k) => [k, counted.reduce((n, m) => n + m[k], 0)]))
    : data.totals;
  const none = Object.fromEntries(FIGURES.map((k) => [k, 0]));
  const thisMonth = today ? Number(today.slice(5, 7)) : new Date().getMonth() + 1;
  const isOpen = (month, bucket) => selected?.month === month && (selected?.bucket ?? null) === bucket;

  const number = (m, bucket) => {
    const n = bucket ? m[bucket] : m.total;
    if (!n) return <span className="text-muted-foreground">0</span>;
    // Without `href` (a client's view of their project), figures only: the names behind them are an administrator's report.
    if (!href) return <span className="px-1.5 py-0.5 font-semibold tabular-nums">{n.toLocaleString()}</span>;
    return (
      <Link
        href={href(m.month, bucket)}
        aria-label={`${m.label}: ${n} ${bucket ? COLUMNS.find((c) => c.key === bucket).label.toLowerCase() : "renewals"}`}
        className={cn(
          "rounded px-1.5 py-0.5 font-semibold tabular-nums transition-colors hover:bg-primary/10 hover:text-primary",
          isOpen(m.month, bucket) && "bg-primary/15 text-primary"
        )}
      >
        {n.toLocaleString()}
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      {/* Figures up the left and a bar/line/area/pie menu (client, Nov 2026). Hovering a month (or focusing
          one of its colours) shows its figures above its column; each colour opens the names behind it. */}
      <ReportChart
        id={compact ? "xdate-months-project" : "xdate-months"}
        stacked
        height={compact ? "h-44" : "h-60"}
        series={SEGMENTS}
        tips={monthTips(months)}
        legendExtra={(
          <>
            <span>Total {totals.total.toLocaleString()}</span>
            {undated.total ? <span>No renewal date {undated.total.toLocaleString()}</span> : null}
          </>
        )}
        points={months.map((m) => ({
          key: m.month,
          label: m.short,
          values: Object.fromEntries(SEGMENTS.map((s) => [s.key, m[s.key]])),
          // Without `href` (a client's view of their project), figures only: the names behind them are an administrator's report.
          href: href ? Object.fromEntries(SEGMENTS.map((s) => [s.key, href(m.month, s.bucket)])) : undefined,
          segLabel: Object.fromEntries(SEGMENTS.map((s) => [s.key, `${m.label}: ${m[s.bucket] ?? m[s.key]} ${s.label.toLowerCase()}`])),
          selected: SEGMENTS.find((s) => isOpen(m.month, s.bucket))?.key,
          current: m.month === thisMonth,
          // Renewal months picked (X-Dates filters; Sean, Oct 2026): the others faded, and left out of the pie.
          faded: picked ? !picked.has(m.month) : false,
          attrs: { "data-month-column": m.month, "data-picked": picked ? picked.has(m.month) || undefined : undefined },
        }))}
      />

      {compact ? null : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Renewal month</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {COLUMNS.map((c) => <TableHead key={c.key} className="text-right">{c.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...counted, ...(undated.total && !picked ? [undated] : [])].map((m) => (
              <TableRow key={m.month} className={cn(selected?.month === m.month && "bg-primary/5")}>
                <TableCell className={cn("font-medium", m.month === thisMonth && "text-primary")}>
                  {m.label}{m.month === thisMonth ? <span className="ml-2 text-xs font-normal text-muted-foreground">this month</span> : null}
                </TableCell>
                <TableCell className="text-right">{number(m, null)}</TableCell>
                {COLUMNS.map((c) => <TableCell key={c.key} className="text-right">{number(m, c.key)}</TableCell>)}
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-semibold">
              <TableCell>{picked ? "These months" : "All months"}</TableCell>
              <TableCell className="text-right tabular-nums">{(totals.total + (picked ? none : undated).total).toLocaleString()}</TableCell>
              {COLUMNS.map((c) => (
                <TableCell key={c.key} className="text-right tabular-nums">{(totals[c.key] + (picked ? none : undated)[c.key]).toLocaleString()}</TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      )}
    </div>
  );
}
