import Link from "@/components/shared/intent-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Bottom to top in each column, and left to right in the table.
const SEGMENTS = [
  { key: "appointment", label: "Appointments", color: "var(--neon-emerald)" },
  { key: "off", label: "Off the list", color: "var(--neon-rose)" },
  { key: "viable", label: "Viable left", color: "var(--neon-cyan)" },
];

/**
 * Renewals per month of the year, as stacked columns and as a table. Every
 * number is a link to the names behind it: `href(month, bucket)` builds it
 * (bucket null for the month's total). `selected` marks the one open.
 * `compact` draws the columns only, for the project page.
 */
export default function XdateMonths({ data, href, selected, compact = false }) {
  const { months, undated, totals } = data;
  const max = Math.max(1, ...months.map((m) => m.total));
  const thisMonth = new Date().getMonth() + 1;
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

      <div className={cn("flex items-stretch gap-1.5 sm:gap-3", compact ? "h-44" : "h-60")}>
        {months.map((m, i) => (
          <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex min-h-0 w-full flex-1 flex-col justify-end">
              {m.total ? (
                <div
                  className="animate-grow-height flex w-full flex-col-reverse overflow-hidden rounded-t transition-[height] duration-500"
                  style={{ height: `${(m.total / max) * 100}%`, animationDelay: `${i * 45}ms` }}
                >
                  {SEGMENTS.map((s) =>
                    m[s.key] ? (
                      <Link
                        key={s.key}
                        href={href(m.month, s.key)}
                        title={`${m.label}: ${m[s.key].toLocaleString()} ${s.label.toLowerCase()}`}
                        aria-label={`${m.label}: ${m[s.key]} ${s.label.toLowerCase()}`}
                        className={cn("block w-full transition-opacity hover:opacity-80", isOpen(m.month, s.key) && "outline-2 -outline-offset-2 outline-foreground")}
                        style={{ height: `${(m[s.key] / m.total) * 100}%`, background: s.color, minHeight: 2 }}
                      />
                    ) : null
                  )}
                </div>
              ) : (
                <div className="h-0.5 w-full rounded bg-[var(--panel-border)]" />
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
      </div>

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
