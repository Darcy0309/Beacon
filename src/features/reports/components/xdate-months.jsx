import Link from "@/components/shared/intent-link";
import TipLayer from "@/components/shared/tip-layer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Bottom to top in each column, and left to right in the table.
const SEGMENTS = [
  { key: "appointment", label: "Appointments", color: "var(--chart-win)" },
  { key: "off", label: "Off the list", color: "var(--chart-done)" },
  { key: "viable", label: "Viable left", color: "var(--chart-viable)" },
];

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

/** Each month's figures for its tooltip: every colour with its share, and the total. */
const monthTips = (months) =>
  Object.fromEntries(months.map((m) => [m.month, {
    title: m.label,
    rows: SEGMENTS.slice().reverse().map((s) => ({ key: s.key, label: s.label, color: s.color, value: m[s.key].toLocaleString(), share: `${pct(m[s.key], m.total)}%` })),
    total: m.total.toLocaleString(),
    foot: m.total ? "Click a colour to see those names" : null,
  }]));

/**
 * Renewals per month of the year, as stacked columns and as a table. Every
 * number is a link to the names behind it: `href(month, bucket)` builds it
 * (bucket null for the month's total). `selected` marks the one open.
 * `compact` draws the columns only, for the project page. `today` (the
 * business's "YYYY-MM-DD") marks the current month; the server's own clock
 * runs on UTC, a month ahead on the last evening of one.
 */
export default function XdateMonths({ data, href, selected, today, compact = false }) {
  const { months, undated, totals } = data;
  const max = Math.max(1, ...months.map((m) => m.total));
  const thisMonth = today ? Number(today.slice(5, 7)) : new Date().getMonth() + 1;
  const isOpen = (month, bucket) => selected?.month === month && (selected?.bucket ?? null) === bucket;

  const number = (m, bucket) => {
    const n = bucket ? m[bucket] : m.total;
    if (!n) return <span className="text-muted-foreground">0</span>;
    return (
      <Link
        href={href(m.month, bucket)}
        aria-label={`${m.label}: ${n} ${bucket ? SEGMENTS.find((s) => s.key === bucket).label.toLowerCase() : "renewals"}`}
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
      <div className="flex flex-wrap items-center gap-4 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {SEGMENTS.slice().reverse().map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        <span>Total {totals.total.toLocaleString()}</span>
        {undated.total ? <span>No renewal date {undated.total.toLocaleString()}</span> : null}
      </div>

      {/* Hovering a month (or focusing one of its colours) shows its figures above its column. */}
      <TipLayer tips={monthTips(months)} className={cn("flex items-stretch gap-1.5 sm:gap-3", compact ? "h-44" : "h-60")}>
        {months.map((m, i) => (
          <div key={m.month} data-tip={m.month} data-month-column={m.month} className="group/month relative flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex min-h-0 w-full flex-1 flex-col justify-end rounded-t transition-colors group-hover/month:bg-foreground/[0.04]">
              {m.total ? (
                <div
                  data-tip-anchor
                  // A hairline between the colours, so each reads on its own.
                  className="animate-grow-height flex w-full flex-col-reverse gap-px overflow-hidden rounded-t-md transition-[height] duration-500"
                  style={{ height: `${(m.total / max) * 100}%`, animationDelay: `${i * 45}ms` }}
                >
                  {SEGMENTS.map((s) =>
                    m[s.key] ? (
                      <Link
                        key={s.key}
                        href={href(m.month, s.key)}
                        data-seg={s.key}
                        data-tip-row={s.key}
                        aria-label={`${m.label}: ${m[s.key]} ${s.label.toLowerCase()}`}
                        className={cn("block w-full transition-opacity hover:opacity-80", isOpen(m.month, s.key) && "outline-2 -outline-offset-2 outline-foreground")}
                        style={{ height: `${(m[s.key] / m.total) * 100}%`, background: s.color, minHeight: 2 }}
                      />
                    ) : null
                  )}
                </div>
              ) : (
                <div data-tip-anchor className="h-0.5 w-full rounded bg-[var(--panel-border)]" />
              )}
            </div>
            <span className={cn(
              "text-[0.62rem] font-semibold uppercase tracking-[0.08em] sm:text-[0.66rem]",
              m.month === thisMonth ? "text-primary" : "text-muted-foreground"
            )}>
              {m.short}
            </span>
          </div>
        ))}
      </TipLayer>

      {compact ? null : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Renewal month</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {SEGMENTS.map((s) => <TableHead key={s.key} className="text-right">{s.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...months, ...(undated.total ? [undated] : [])].map((m) => (
              <TableRow key={m.month} className={cn(selected?.month === m.month && "bg-primary/5")}>
                <TableCell className={cn("font-medium", m.month === thisMonth && "text-primary")}>
                  {m.label}{m.month === thisMonth ? <span className="ml-2 text-xs font-normal text-muted-foreground">this month</span> : null}
                </TableCell>
                <TableCell className="text-right">{number(m, null)}</TableCell>
                {SEGMENTS.map((s) => <TableCell key={s.key} className="text-right">{number(m, s.key)}</TableCell>)}
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-semibold">
              <TableCell>All months</TableCell>
              <TableCell className="text-right tabular-nums">{(totals.total + undated.total).toLocaleString()}</TableCell>
              {SEGMENTS.map((s) => (
                <TableCell key={s.key} className="text-right tabular-nums">{(totals[s.key] + undated[s.key]).toLocaleString()}</TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      )}
    </div>
  );
}
