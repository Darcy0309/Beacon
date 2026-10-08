import Link from "@/components/shared/intent-link";
import { CalendarRange } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import RowActions from "@/components/shared/row-actions";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PayPeriodForm from "@/features/pay/components/pay-period-form";
import { deletePayPeriod } from "@/features/pay/actions";
import { addDays, formatIso } from "@/lib/dates";
import { shortDay } from "@/lib/pay";
import { cn } from "@/lib/utils";

const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const mdy = (iso) => `${md(iso)}/${iso.slice(0, 4)}`;

/** "Fri 5/22, Mon 5/25 (Closed – Memorial Day weekend)" */
function DaysNote({ dates, label, kind }) {
  if (!dates.length) return null;
  const days = dates.map(shortDay).join(", ");
  const what = kind === "closed" ? `Closed${label ? ` – ${label}` : ""}` : `Optional${label ? ` – ${label}` : ""}`;
  return (
    <span data-days={kind} className={kind === "closed" ? "font-semibold text-destructive" : "text-foreground/85"}>
      {days} ({what})
    </span>
  );
}

/**
 * The pay period schedule, as the business sends it round: each period, its
 * pay date, the days closed (in red) or optional, and its work days, a year
 * at a time with the year's work days. Today's period is marked.
 * `editable` (Settings, administrators): add, change and remove periods.
 * Otherwise (Pay & Hours) each period opens its pay.
 */
export default function PaySchedule({ periods, today, editable = false }) {
  // A year is the one a period ends in (12/30–1/13 is the new year's first).
  const years = [];
  for (const p of periods) {
    const y = p.to.slice(0, 4);
    const last = years.at(-1);
    if (last?.year === y) last.periods.push(p);
    else years.push({ year: y, periods: [p] });
  }
  const latest = periods.at(-1);
  const next = latest
    ? { from: addDays(latest.to, 1), to: addDays(latest.to, 14), payDate: addDays(latest.to, 16) }
    : { from: today, to: addDays(today, 13), payDate: addDays(today, 15) };

  return (
    <Card data-pay-schedule>
      <SectionHeader
        label="Pay Periods"
        icon={CalendarRange}
        action={editable ? <PayPeriodForm next={next} /> : null}
      />
      {periods.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {editable
            ? "No pay periods yet. Add the first; each one after starts the day after the last."
            : "No pay periods on the schedule yet."}
        </p>
      ) : (
        years.map(({ year, periods: list }) => (
          <div key={year} data-pay-year={year} className="border-t border-[var(--panel-border)] first:border-t-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">{year} · Pay period</TableHead>
                  <TableHead className="w-28">Pay date</TableHead>
                  <TableHead>Optional / closed days</TableHead>
                  <TableHead className="w-24 text-right">Work days</TableHead>
                  {editable ? <TableHead className="w-12" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => {
                  const now = p.from <= today && today <= p.to;
                  const range = `${md(p.from)} – ${md(p.to)}`;
                  return (
                    <TableRow key={p.id} data-pay-period={`${p.from}:${p.to}`} className={cn(now && "bg-primary/5")}>
                      <TableCell className="whitespace-nowrap font-medium tabular-nums">
                        {editable ? range : (
                          <Link href={`/reports/pay?period=custom&from=${p.from}&to=${p.to}`} className="hover:text-primary hover:underline">{range}</Link>
                        )}
                        {now ? <span className="ml-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-primary">Now</span> : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums" title={p.payDate ? formatIso(p.payDate, "long") : undefined}>
                        {p.payDate ? mdy(p.payDate) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                          <DaysNote dates={p.optional} label={p.optionalLabel} kind="optional" />
                          <DaysNote dates={p.closed} label={p.closedLabel} kind="closed" />
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums" data-work-days>{p.workDays}</TableCell>
                      {editable ? (
                        <TableCell className="text-right">
                          <RowActions
                            name={`the pay period ${range}`}
                            id={p.id}
                            edit={<PayPeriodForm period={p} />}
                            onDelete={deletePayPeriod}
                            warning="It comes off the schedule; the time and pay in it stay, and Pay & Hours still shows any dates you pick."
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="text-right text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Work days in {year}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums" data-year-work-days>{list.reduce((n, p) => n + p.workDays, 0)}</TableCell>
                  {editable ? <TableCell /> : null}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ))
      )}
    </Card>
  );
}
