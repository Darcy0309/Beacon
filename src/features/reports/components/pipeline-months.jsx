import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pipelineByMonth } from "@/lib/pipeline-months";
import { cn } from "@/lib/utils";

const n = (v) => (v == null ? "—" : v.toLocaleString());
const pct = (v) => (v == null ? "—" : `${v}%`);

/**
 * The Pipeline by Month (Sean, Nov 2026: the old system's pipeline sheet), under
 * the renewals by month: the total, off the list (resolved: appointments and
 * invalid ones among them), viable, projected appointments at `rate` (20%
 * unless set), each month's conversion and the appointments set, the total
 * first, then January to December; the overall conversion below. `data`:
 * getXdatesByMonth()'s; `today` marks the current month.
 */
export default function PipelineMonths({ data, rate, today }) {
  const p = pipelineByMonth(data.months, rate);
  const thisMonth = today ? Number(today.slice(5, 7)) : null;
  const cols = [p.total, ...p.months];
  // [label, figure, format, no total, stands out]: the totals and the viable leads larger and bolder (Sean, Nov 2026).
  const rows = [
    ["Total by month", "total", n, false, true],
    ["Off the list (resolved)", "off", n],
    ["Viable leads", "viable", n, false, true],
    [`Projected appts (${p.rate}%)`, "projected", n],
    ["Conversion % (total leads)", "conversion", pct, true],
    ["Actual appts", "appointments", n],
  ];
  return (
    <div data-pipeline-months>
      <div className="overflow-x-auto">
        <Table className="min-w-[56rem] text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-52" />
              {cols.map((c, i) => (
                <TableHead key={c.short} className={cn("text-right", i === 0 && "font-bold text-foreground", c.month === thisMonth && "text-primary")}>
                  {i === 0 ? "Total" : c.short}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([label, key, fmt, noTotal, stands]) => (
              <TableRow key={key} data-pipeline-row={key} data-stands-out={stands || undefined} className={cn(stands && "bg-muted/50")}>
                <TableCell className={cn("whitespace-nowrap font-medium", stands && "text-base font-bold text-foreground")}>{label}</TableCell>
                {cols.map((c, i) => (
                  <TableCell key={c.short} className={cn("text-right tabular-nums", i === 0 && "font-semibold", stands && "text-base font-bold text-foreground")}>
                    {i === 0 && noTotal ? "" : fmt(c[key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="border-t border-[var(--panel-border)] px-4 py-2.5 text-sm" data-pipeline-overall>
        Overall conversion: <strong className="tabular-nums">{pct(p.overall)}</strong>
        <span className="text-muted-foreground"> · appointments set of all the leads with a renewal month</span>
        {data.undated?.total ? <span className="text-muted-foreground"> · {data.undated.total.toLocaleString()} without a renewal date not counted</span> : null}
      </p>
    </div>
  );
}
