import Link from "@/components/shared/intent-link";
import {
  Banknote, CalendarCheck, CheckCheck, Download, ListChecks, PhoneCall, Target, Undo2, Users,
} from "lucide-react";
import Topbar from "@/components/layout/topbar";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import FilterTable from "@/components/shared/filter-table";
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ProjectRatesForm from "@/features/projects/components/project-rates-form";
import { getProjectRates } from "@/features/projects/queries";
import { getBusinessTimeZone, getProductionReport } from "@/features/reports/queries";
import { daysBetween, PERIODS, readPeriod, trendStart } from "@/features/reports/period";
import { getAssignableStaff } from "@/features/users/queries";
import { getLookups } from "@/lib/server/lookups";
import { getCurrentUser } from "@/lib/server/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const idParam = (v) => (/^[1-9]\d{0,17}$/.test(v ?? "") ? Number(v) : null);
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const COUNTS = ["calls", "leads", "appointments", "confirmations", "chargebacks", "amount"];
const add = (into, r) => {
  for (const k of COUNTS) into[k] = (into[k] ?? 0) + r[k];
  return into;
};
const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

/**
 * Daily production and pay: calls made, and the events each rep is paid
 * for (a DBDev Lead, an appointment, a confirmation) at the project's rates,
 * less chargebacks. An administrator sees everyone and sets the rates;
 * everyone else sees only their own production.
 */
export default async function ProductionReport({ searchParams }) {
  const sp = await searchParams;
  const [me, timeZone] = await Promise.all([getCurrentUser(), getBusinessTimeZone()]);
  const admin = me?.role === "admin";
  const range = readPeriod(sp, timeZone);
  const projectId = idParam(sp?.project);
  const userId = admin ? idParam(sp?.rep) : null;

  // The tiles show a trend of at least two weeks, so one read covers the
  // range and the days before it that the trend needs.
  const trendFrom = trendStart(range);
  const [trendRows, options, staff, rates] = await Promise.all([
    getProductionReport({ from: trendFrom, to: range.to, projectId, userId }),
    getLookups(),
    admin ? getAssignableStaff() : [],
    admin ? getProjectRates() : [],
  ]);
  const rows = trendRows.filter((r) => r.day >= range.from && r.day <= range.to);

  const totals = rows.reduce(add, {});
  for (const k of COUNTS) totals[k] ??= 0;
  const reps = Object.values(
    rows.reduce((acc, r) => {
      acc[r.userId] ??= { id: r.userId, rep: r.rep };
      add(acc[r.userId], r);
      return acc;
    }, {})
  ).sort((a, b) => b.amount - a.amount || b.calls - a.calls || a.rep.localeCompare(b.rep));

  // One point a day, for the tile sparklines: the range, or the last 14 days if it is shorter.
  const days = daysBetween(trendFrom, range.to);
  const perDay = (key) => days.map((d) => trendRows.filter((r) => r.day === d).reduce((n, r) => n + r[key], 0));
  const unratedProjects = rates.filter((p) => !p.lead && !p.appointment && !p.confirmation).length;

  const tiles = [
    { label: "Calls", value: totals.calls.toLocaleString(), note: `${reps.length} rep${reps.length === 1 ? "" : "s"} calling`, icon: PhoneCall, accent: "var(--neon-cyan)", series: perDay("calls"), bars: true },
    { label: "Leads", value: totals.leads.toLocaleString(), note: "promoted to appointment setting", icon: Target, accent: "var(--neon-blue)", series: perDay("leads") },
    { label: "Appointments", value: totals.appointments.toLocaleString(), note: "set from a call", icon: CalendarCheck, accent: "var(--neon-violet)", series: perDay("appointments"), bars: true },
    { label: "Confirmations", value: totals.confirmations.toLocaleString(), note: "appointments confirmed", icon: CheckCheck, accent: "var(--neon-emerald)", series: perDay("confirmations") },
    { label: "Chargebacks", value: totals.chargebacks.toLocaleString(), note: "invalid leads and appointments", icon: Undo2, accent: "var(--neon-rose)", series: perDay("chargebacks"), bars: true },
    { label: admin ? "Pay" : "My pay", value: usd(totals.amount), note: "at each project's rates", icon: Banknote, accent: "var(--neon-amber)", series: perDay("amount") },
  ];

  // Links and the CSV keep every filter; a preset replaces a custom range.
  const keep = (extra) => {
    const p = new URLSearchParams();
    if (projectId) p.set("project", String(projectId));
    if (userId) p.set("rep", String(userId));
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return p.toString();
  };
  const csv = `/api/reports/production?${keep({ period: range.period, from: range.period === "custom" ? range.from : "", to: range.period === "custom" ? range.to : "" })}`;

  return (
    <>
      <Topbar title="Production & Pay" sub={`${range.label} · ${admin ? "every rep" : "your production"}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            {PERIODS.map(([key, label]) => (
              <Link
                key={key}
                href={`/reports/production?${keep({ period: key })}`}
                aria-current={range.period === key ? "true" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  range.period === key ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary"
                )}
              >
                {label}
              </Link>
            ))}
            {/* A plain GET form, so a custom range is a link like the presets; the picker submits it on Apply. */}
            <form action="/reports/production">
              <input type="hidden" name="period" value="custom" />
              {projectId ? <input type="hidden" name="project" value={projectId} /> : null}
              {userId ? <input type="hidden" name="rep" value={userId} /> : null}
              <DateRangePicker key={`${range.from}:${range.to}`} defaultFrom={range.from} defaultTo={range.to} max="today" active={range.period === "custom"} />
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[var(--panel-border)] px-5 py-3">
            <ParamSelect name="project" label="Project" value={projectId ? String(projectId) : ""} placeholder="All projects"
              options={options.projects.map((p) => ({ value: String(p.id), label: p.name }))} />
            {admin ? (
              <ParamSelect name="rep" label="Rep" value={userId ? String(userId) : ""} placeholder="Every rep"
                options={staff.map((s) => ({ value: String(s.id), label: s.name }))} />
            ) : null}
            <span className="text-xs text-muted-foreground">Days run midnight to midnight, {timeZone.replace(/_/g, " ")} time.</span>
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <a href={csv} download><Download /> Export CSV</a>
            </Button>
          </div>
          {range.error ? <p role="alert" className="border-t border-[var(--panel-border)] px-5 py-2 text-sm text-destructive">{range.error} Showing today instead.</p> : null}
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label={admin ? "By Rep" : "My Production"} icon={Users} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Appointments</TableHead>
                <TableHead className="text-right">Confirmations</TableHead>
                <TableHead className="text-right">Chargebacks</TableHead>
                <TableHead className="text-right">Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reps.map((r) => (
                <TableRow key={r.id} data-rep={r.id}>
                  <TableCell className="font-medium">{r.rep}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.leads.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.appointments.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.confirmations.toLocaleString()}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.chargebacks && "text-rose-400")}>{r.chargebacks.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{usd(r.amount)}</TableCell>
                </TableRow>
              ))}
              {reps.length ? (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  {COUNTS.map((k) => (
                    <TableCell key={k} className="text-right tabular-nums">{k === "amount" ? usd(totals[k]) : totals[k].toLocaleString()}</TableCell>
                  ))}
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No calls or paid events {range.period === "today" ? "yet today" : "in this period"}.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        {rows.length ? (
          <Card>
            <SectionHeader label="Day by Day" icon={ListChecks} />
            <FilterTable
              columns={["Day", "Rep", "Project", { label: "Calls", className: "text-right" }, { label: "Leads", className: "text-right" },
                { label: "Appts", className: "text-right" }, { label: "Confirmed", className: "text-right" },
                { label: "Chargebacks", className: "text-right" }, { label: "Pay", className: "text-right" }]}
              filters={admin ? [{ key: "rep", label: "Rep", kind: "select" }, { key: "project", label: "Project", kind: "select" }] : [{ key: "project", label: "Project", kind: "select" }]}
              placeholder="Search days, reps, projects…"
              rows={rows.map((r) => ({
                id: `${r.day}-${r.userId}-${r.projectId ?? "none"}`,
                search: `${dayLabel(r.day)} ${r.rep} ${r.project}`,
                facets: { rep: r.rep, project: r.project },
                node: (
                  <TableRow>
                    <TableCell className="whitespace-nowrap tabular-nums">{dayLabel(r.day)}</TableCell>
                    <TableCell>{r.rep}</TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground" title={r.project}>{r.project}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.leads}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.appointments}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.confirmations}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", r.chargebacks && "text-rose-400")}>{r.chargebacks}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.amount)}</TableCell>
                  </TableRow>
                ),
              }))}
            />
          </Card>
        ) : null}

        {admin ? (
          <Card id="rates">
            <SectionHeader label="Pay Rates by Project" icon={Banknote} />
            <p className="border-b border-[var(--panel-border)] px-5 py-3 text-sm text-muted-foreground">
              What each project pays per lead, appointment and confirmation.
              {unratedProjects ? ` ${unratedProjects} of ${rates.length} still pay $0: set them when the rate sheet arrives.` : ""}
              {" "}A new rate applies from the next event; what is already earned keeps its rate.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Per lead</TableHead>
                  <TableHead className="text-right">Per appointment</TableHead>
                  <TableHead className="text-right">Per confirmation</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((p) => (
                  <TableRow key={p.id} data-project={p.id}>
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="font-medium transition-colors hover:text-primary">{p.name}</Link>
                      <div className="text-xs text-muted-foreground">{p.type}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.client}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(p.lead)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(p.appointment)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(p.confirmation)}</TableCell>
                    <TableCell className="text-right">
                      <ProjectRatesForm project={p} trigger={<Button size="sm" variant="ghost"><Banknote /> Set rates</Button>} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : null}
      </div>
    </>
  );
}
