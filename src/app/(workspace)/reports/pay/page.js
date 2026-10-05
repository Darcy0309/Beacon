import Link from "@/components/shared/intent-link";
import { Banknote, Clock, Download, ListChecks, Timer, Users } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import ToneBadge from "@/components/shared/tone-badge";
import DateRangePicker from "@/components/shared/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPayReport, getPayRules, getWorkDays } from "@/features/pay/queries";
import { getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";
import { formatIso } from "@/lib/dates";
import { hourLabel, hoursLabel, PERIOD_PRESETS, readPayPeriod, ROUNDING, usd } from "@/lib/pay";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const idParam = (v) => (/^[1-9]\d{0,17}$/.test(v ?? "") ? Number(v) : null);
const ROUNDING_TEXT = Object.fromEntries(ROUNDING);

/**
 * Pay & hours for a pay period: for each account manager, the time they
 * worked in Lighthouse (the timer stops after a few idle minutes), what that
 * comes to at their hourly rate, their commission, and what they are due.
 * Hybrid pay is the higher of the two. An administrator sees everyone and
 * can open anyone's days; everyone else sees their own.
 */
export default async function PayReport({ searchParams }) {
  const sp = await searchParams;
  const [me, rules, today] = await Promise.all([getCurrentUser(), getPayRules(), getBusinessToday()]);
  const admin = me?.role === "admin";
  const range = readPayPeriod(sp, today, rules.time);
  const people = await getPayReport({ from: range.from, to: range.to });
  // An administrator opens anyone's days; everyone else always sees their own.
  const openId = admin ? idParam(sp?.user) : me?.id ?? null;
  const open = people.find((p) => p.id === openId) ?? null;
  const days = open ? await getWorkDays({ from: range.from, to: range.to, userId: open.id }) : [];

  const sum = (key) => people.reduce((n, p) => n + p[key], 0);
  const paidMinutes = sum("paidMinutes");
  const tiles = [
    { label: admin ? "Pay Due" : "My Pay", value: usd(sum("pay")), note: admin ? `${people.length} people` : open?.model === "hybrid" ? "the higher of hourly and commission" : "commission",
      icon: Banknote, accent: "var(--neon-amber)" },
    { label: "Hours Paid", value: hoursLabel(paidMinutes), note: `${hoursLabel(sum("workedMinutes"))} worked`, icon: Clock, accent: "var(--neon-cyan)" },
    { label: "Commission", value: usd(sum("commission")), note: "lead, appointment and special pay, less chargebacks", icon: Users, accent: "var(--neon-emerald)" },
    { label: "Hourly Pay", value: usd(sum("hourlyPay")), note: "hours paid × hourly rate", icon: Timer, accent: "var(--neon-violet)" },
  ];

  const keep = (extra) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, String(v));
    return p.toString();
  };
  const periodParams = { period: range.period, from: range.period === "custom" ? range.from : "", to: range.period === "custom" ? range.to : "" };
  const csv = `/api/reports/pay?${keep(periodParams)}`;
  const t = rules.time;
  const rulesText = [
    `The timer stops after ${t.idle_minutes} minute${t.idle_minutes === 1 ? "" : "s"} with no click or key press`,
    t.call_minutes ? `a call counts up to ${t.call_minutes} minutes, from Call now to saving the result` : "calls count only their clicks",
    t.rounding === "none" ? "time is not rounded" : `${ROUNDING_TEXT[t.rounding]?.toLowerCase()} to ${t.round_to} minutes`,
  ].join("; ");

  return (
    <>
      <Topbar title="Pay & Hours" sub={`${range.label} · ${admin ? "every account manager" : "your pay"}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            {PERIOD_PRESETS.map(([key, label]) => (
              <Link
                key={key}
                href={`/reports/pay?${keep({ period: key, user: admin ? openId : null })}`}
                aria-current={range.period === key ? "true" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  range.period === key ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary"
                )}
              >
                {label}
              </Link>
            ))}
            <form action="/reports/pay">
              <input type="hidden" name="period" value="custom" />
              {admin && openId ? <input type="hidden" name="user" value={openId} /> : null}
              <DateRangePicker key={`${range.from}:${range.to}`} defaultFrom={range.from} defaultTo={range.to} active={range.period === "custom"} />
            </form>
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <a href={csv} download data-export="people"><Download /> Export CSV</a>
            </Button>
          </div>
          <p className="border-t border-[var(--panel-border)] px-5 py-3 text-xs text-muted-foreground" data-rules>
            {rulesText}.{" "}
            {admin ? <Link href="/settings" className="text-primary hover:underline">Change in Settings</Link> : null}
          </p>
          {range.error ? <p role="alert" className="border-t border-[var(--panel-border)] px-5 py-2 text-sm text-destructive">{range.error} Showing this pay period instead.</p> : null}
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile, i) => (
            <StatTile key={tile.label} {...tile} className="animate-pop-in" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label={admin ? "Pay for the Period" : "My Pay"} icon={Banknote} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account manager</TableHead>
                <TableHead>Pay</TableHead>
                <TableHead className="text-right">Worked</TableHead>
                <TableHead className="text-right">Paid hours</TableHead>
                <TableHead className="text-right">Hourly pay</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Pay due</TableHead>
                <TableHead className="text-right">Per hour</TableHead>
                <TableHead className="text-right">Calls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => (
                <TableRow key={p.id} data-person={p.id} className={cn(p.id === openId && "bg-primary/5")}>
                  <TableCell>
                    {admin ? (
                      <Link href={`/reports/pay?${keep({ ...periodParams, user: p.id })}`} className="font-medium transition-colors hover:text-primary">{p.name}</Link>
                    ) : (
                      <span className="font-medium">{p.name}</span>
                    )}
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                  </TableCell>
                  <TableCell>
                    {p.model === "hybrid" ? (
                      <ToneBadge tone="violet">Hybrid · {usd(p.rate)}/hr</ToneBadge>
                    ) : (
                      <ToneBadge tone="slate">Commission</ToneBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{hoursLabel(p.workedMinutes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{hoursLabel(p.paidMinutes)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", p.model === "hybrid" && p.paidBy === "hourly" && "font-semibold text-primary")}>
                    {p.model === "hybrid" ? usd(p.hourlyPay) : "—"}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", p.model === "hybrid" && p.paidBy === "commission" && "font-semibold text-primary")}>
                    {usd(p.commission)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums" data-pay-due>{usd(p.pay)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{p.perHour == null ? "—" : usd(p.perHour)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.calls.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {people.length > 1 ? (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{hoursLabel(sum("workedMinutes"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{hoursLabel(paidMinutes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(sum("hourlyPay"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(sum("commission"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(sum("pay"))}</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{sum("calls").toLocaleString()}</TableCell>
                </TableRow>
              ) : null}
              {people.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Nobody to pay in this period.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <p className="border-t border-[var(--panel-border)] px-5 py-3 text-xs text-muted-foreground">
            Hybrid pay is the higher of the hourly pay and the commission, shown in colour. {admin ? "Open a name to see the hours behind it." : ""}
          </p>
        </Card>

        {open ? (
          <Card data-days={open.id}>
            <SectionHeader
              label={admin ? `${open.name} · Day by Day` : "My Days"}
              icon={ListChecks}
              action={
                <a href={`/api/reports/pay?${keep({ ...periodParams, user: open.id })}`} download data-export="days"
                  className="flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-opacity hover:opacity-75">
                  <Download className="size-3" /> CSV
                </a>
              }
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Worked</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Hour by hour (worked → paid)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((d) => (
                  <TableRow key={d.day} data-day={d.day}>
                    <TableCell className="whitespace-nowrap">{formatIso(d.day, "long")}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{hoursLabel(d.worked)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{hoursLabel(d.paid)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {d.hours.map((h) => (
                          <span key={h.hour} className="rounded border border-[var(--panel-border)] px-1.5 py-0.5 text-[0.7rem] tabular-nums text-muted-foreground"
                            title={`${hourLabel(h.hour)}: ${h.minutes} minutes worked, ${h.paid} paid`}>
                            {hourLabel(h.hour)} · {h.minutes}m{h.paid !== h.minutes ? ` → ${h.paid}m` : ""}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {days.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No time worked in this period.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Card>
        ) : null}
      </div>
    </>
  );
}
