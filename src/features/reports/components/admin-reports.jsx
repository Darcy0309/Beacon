import { Award, BarChart3, CalendarCheck, CheckCheck, Radio, Receipt, Target, UserCheck, Users } from "lucide-react";
import Link from "@/components/shared/intent-link";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import MetricBar from "@/components/shared/metric-bar";
import TipLayer from "@/components/shared/tip-layer";
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import CsvButton from "@/components/shared/csv-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PeriodSwitch from "@/features/dashboard/components/period-switch";
import { getBillingReport, getReportCounts, getReportNames } from "@/features/reports/admin-queries";
import { PERIODS, billingCsv, groupBy, inMonths, lastMonths, monthSeries, outcomes, periodOf, topClients, totals, withBilling } from "@/lib/admin-reports";
import { monthBarTips } from "@/lib/chart-tips";
import { formatRange, isIsoDate, monthStart } from "@/lib/dates";
import { cn } from "@/lib/utils";

const BAR_COLORS = ["var(--neon-cyan)", "var(--neon-emerald)", "var(--neon-amber)", "var(--neon-violet)", "var(--neon-magenta)"];
const usd = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" }));
const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** A card's own period, beside its title: the current month, or the last three or six. */
function Period({ param, current, params }) {
  return <PeriodSwitch param={param} current={String(current)} params={params} options={PERIODS} base="/reports" />;
}

/**
 * The administrators' Reports (Sean, Nov 2026). Along the top: leads delivered, appointments set (with
 * those confirmed and invalid), each Sales Rep's clients' production, and the top five clients (a lead 1,
 * an appointment 2); then leads against appointments by month, for every client or a Sales Rep's, with
 * the figures under the bars; then appointments and leads by manager, with the invalid ones, and the
 * appointments' outcomes; each over the current month or the last three or six, its own choice. At the
 * foot, the billing listing: each active client's projects over a range of days, a Sales Rep's or all,
 * billed at the project's rates, with what they cost, every figure opening its names, to export.
 */
export default async function AdminReports({ sp, today }) {
  const params = Object.fromEntries(Object.entries(sp ?? {}).filter(([, v]) => typeof v === "string"));
  const months = lastMonths(today, 6);
  const keys = (n) => months.slice(6 - n).map((m) => m.key);

  // Billing: the current month to today unless a range is given.
  const bFrom = isIsoDate(sp?.bf) ? sp.bf : monthStart(today);
  const bTo = isIsoDate(sp?.bt) && sp.bt >= bFrom ? sp.bt : today;
  const bRep = /^\d+$/.test(sp?.brep ?? "") ? Number(sp.brep) : null;

  const [rows, names, billing] = await Promise.all([
    getReportCounts(months[0].from, today),
    getReportNames(),
    getBillingReport(bFrom, bTo, bRep),
  ]);
  const project = (id) => names.projects[id] ?? { name: "—", client: "—", companyId: null, salesRepId: null, salesRep: null };
  const person = (id) => (id == null ? "Unassigned" : names.people[id] ?? "—");
  const period = (param) => periodOf(sp?.[param]);
  const of = (param) => inMonths(rows, keys(period(param)));

  // The top row.
  const lt = totals(of("lt"));
  const ltProjects = new Set(of("lt").filter((r) => Number(r.leads) > 0).map((r) => r.project_id)).size;
  const at = totals(of("at"));
  const atLeads = totals(of("at")).leads;
  const series = monthSeries(rows, months);
  const byRep = groupBy(of("sr"), (r) => project(r.project_id).salesRepId)
    .map((g) => ({ ...g, name: names.reps.find((x) => x.id === g.key)?.name ?? "—" })).sort((a, b) => a.name.localeCompare(b.name));
  const clientName = (id) => Object.values(names.projects).find((p) => p.companyId === id)?.client ?? "—";
  const top = topClients(groupBy(of("tc"), (r) => project(r.project_id).companyId), 5, clientName);

  // The chart: every client's, or one Sales Rep's.
  const chRep = /^\d+$/.test(sp?.chrep ?? "") ? Number(sp.chrep) : null;
  const chMonths = months.slice(6 - period("ch"));
  const chart = monthSeries(chRep ? rows.filter((r) => project(r.project_id).salesRepId === chRep) : rows, chMonths);
  const chMax = Math.max(1, ...chart.map((m) => Math.max(m.leads, m.appts)));
  const chTotal = { leads: chart.reduce((n, m) => n + m.leads, 0), appts: chart.reduce((n, m) => n + m.appts, 0) };

  // By manager, and the outcomes.
  const apptsBy = groupBy(of("ar"), (r) => r.user_id ?? 0).filter((g) => g.appts + g.invalid_appts > 0).sort((a, b) => b.appts - a.appts);
  const leadsBy = groupBy(of("lr"), (r) => r.user_id ?? 0).filter((g) => g.leads + g.invalid_leads > 0).sort((a, b) => b.leads - a.leads);
  const out = outcomes(totals(of("ao")));

  // The billing listing.
  const bill = billing.map(withBilling);
  const sum = (k) => bill.reduce((n, r) => n + (r[k] ?? 0), 0);
  const itemHref = (r, kind) => `/reports/billing?project=${r.project_id}&kind=${kind}&from=${bFrom}&to=${bTo}${bRep ? `&rep=${bRep}` : ""}`;
  const figure = (r, kind, n) => (n ? <Link href={itemHref(r, kind)} className="font-semibold text-primary hover:underline" data-billing-link={kind}>{n.toLocaleString()}</Link> : <span className="text-muted-foreground">0</span>);
  const repOptions = names.reps.map((r) => ({ value: String(r.id), label: r.name }));

  return (
    <div className="space-y-4" data-admin-reports>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Leads Delivered" value={lt.leads.toLocaleString()} icon={Target} accent="var(--neon-cyan)" series={series.map((m) => m.leads)}
          note={`${plural(ltProjects, "project")}${lt.invalid_leads ? ` · ${lt.invalid_leads} invalid` : ""}`} action={<Period param="lt" current={period("lt")} params={params} />} />
        <StatTile label="Appointments Set" value={at.appts.toLocaleString()} icon={CalendarCheck} accent="var(--neon-emerald)" series={series.map((m) => m.appts)}
          note={`${pct(at.appts, atLeads)}% of leads`} action={<Period param="at" current={period("at")} params={params} />}>
          <p className="mt-1 text-xs text-muted-foreground" data-appts-split>
            <span className="font-semibold text-foreground">{at.confirmed.toLocaleString()}</span> confirmed · <span className="font-semibold text-foreground">{at.invalid_appts.toLocaleString()}</span> invalid
          </p>
        </StatTile>

        <Card className="flex flex-col" data-card="sales-reps">
          <SectionHeader label="Clients by Sales Rep" icon={Users} wrap action={<Period param="sr" current={period("sr")} params={params} />} />
          <div className="flex-1 overflow-x-auto px-2 pb-2">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Sales Rep</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Inv.</TableHead>
                  <TableHead className="text-right">Appts</TableHead><TableHead className="text-right">Inv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byRep.map((g) => (
                  <TableRow key={g.key} data-rep-row={g.key}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.leads}</TableCell><TableCell className="text-right tabular-nums text-rose-400">{g.invalid_leads}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.appts}</TableCell><TableCell className="text-right tabular-nums text-rose-400">{g.invalid_appts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {byRep.length === 0 ? <p className="px-2 py-4 text-sm text-muted-foreground">Nothing in this period.</p> : null}
          </div>
        </Card>

        <Card className="flex flex-col" data-card="top-clients">
          <SectionHeader label="Top Producing Clients" icon={Award} wrap action={<Period param="tc" current={period("tc")} params={params} />} />
          <ol className="flex-1 divide-y divide-[var(--panel-border)] px-4">
            {top.map((g, i) => (
              <li key={g.key} className="flex items-baseline justify-between gap-3 py-2 text-sm" data-top-client={g.key}>
                <span className="min-w-0 truncate"><span className="mr-1.5 tabular-nums text-muted-foreground">{i + 1}.</span>{clientName(g.key)}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground"><strong className="text-sm text-foreground">{g.units}</strong> · {g.leads} L · {g.appts} A</span>
              </li>
            ))}
          </ol>
          {top.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing in this period.</p> : null}
          <p className="px-4 pb-3 text-[0.68rem] text-muted-foreground">Score: a lead 1, an appointment 2</p>
        </Card>
      </div>

      <Card data-card="leads-vs-appts">
        <SectionHeader label="Leads vs Appointments" icon={BarChart3}
          action={<span className="flex items-center gap-3"><ParamSelect name="chrep" label="Sales Rep" value={chRep ? String(chRep) : ""} options={repOptions} placeholder="All" clears={[]} />
            <Period param="ch" current={period("ch")} params={params} /></span>} />
        <div className="p-5">
          <div className="mb-4 flex items-center gap-4 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: "var(--neon-cyan)" }} /> Leads</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: "var(--neon-emerald)" }} /> Appointments</span>
          </div>
          <TipLayer tips={monthBarTips(chart)} className="flex h-56 items-stretch gap-3" data-months-chart>
            {chart.map((m, i) => (
              <div key={m.key} data-tip={m.key} role="img" aria-label={`${m.label}: ${m.leads} leads, ${m.appts} appointments`} className="flex min-h-0 flex-1 flex-col items-center gap-2">
                <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-1.5">
                  {[["leads", "var(--neon-cyan)"], ["appts", "var(--neon-emerald)"]].map(([k, c], j) => (
                    <div key={k} data-tip-row={k} data-tip-anchor={(k === "leads") === (m.leads >= m.appts) ? "" : undefined}
                      className="animate-grow-height w-1/3 max-w-16 rounded-t" style={{ height: `${(m[k] / chMax) * 100}%`, background: c, boxShadow: `0 0 12px -3px ${c}`, animationDelay: `${i * 70 + j * 35}ms` }} />
                  ))}
                </div>
                <span className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{m.label}</span>
              </div>
            ))}
          </TipLayer>
        </div>
        {/* The figures under the bars, as the pipeline sheet has them. */}
        <div className="overflow-x-auto border-t border-[var(--panel-border)]">
          <Table className="text-sm" data-chart-table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40" />
                <TableHead className="text-right font-bold text-foreground">Total</TableHead>
                {chart.map((m) => <TableHead key={m.key} className="text-right">{m.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[["Leads", "leads"], ["Appointments", "appts"]].map(([label, k]) => (
                <TableRow key={k} data-chart-row={k}>
                  <TableCell className="font-medium">{label}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{chTotal[k].toLocaleString()}</TableCell>
                  {chart.map((m) => <TableCell key={m.key} className="text-right tabular-nums">{m[k].toLocaleString()}</TableCell>)}
                </TableRow>
              ))}
              <TableRow data-chart-row="conversion">
                <TableCell className="font-medium">Conversion %</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{pct(chTotal.appts, chTotal.leads)}%</TableCell>
                {chart.map((m) => <TableCell key={m.key} className="text-right tabular-nums">{m.leads ? `${pct(m.appts, m.leads)}%` : "—"}</TableCell>)}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card data-card="appts-by-rep">
          <SectionHeader label="Appointments by Rep" icon={Radio} action={<Period param="ar" current={period("ar")} params={params} />} />
          <div className="space-y-2.5 p-4">
            {apptsBy.map((g, i) => (
              <MetricBar key={g.key} label={`${person(g.key || null)}${g.invalid_appts ? ` · ${g.invalid_appts} invalid` : ""}`} value={g.appts} max={apptsBy[0]?.appts || 1} color={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
            {apptsBy.length === 0 ? <p className="text-sm text-muted-foreground">No appointments in this period.</p> : null}
          </div>
        </Card>
        <Card data-card="leads-by-rep">
          <SectionHeader label="Leads by Rep" icon={UserCheck} action={<Period param="lr" current={period("lr")} params={params} />} />
          <div className="space-y-2.5 p-4">
            {leadsBy.map((g, i) => (
              <MetricBar key={g.key} label={`${person(g.key || null)}${g.invalid_leads ? ` · ${g.invalid_leads} invalid` : ""}`} value={g.leads} max={leadsBy[0]?.leads || 1} color={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
            {leadsBy.length === 0 ? <p className="text-sm text-muted-foreground">No leads in this period.</p> : null}
          </div>
        </Card>
        <Card data-card="outcomes">
          <SectionHeader label="Appointment Outcomes" icon={CheckCheck} action={<Period param="ao" current={period("ao")} params={params} />} />
          <div className="divide-y divide-[var(--panel-border)]">
            {out.map(([name, count]) => (
              <div key={name} data-outcome={name} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>{name}</span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  <span className="font-semibold">{count.toLocaleString()}</span>
                  <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">{pct(count, out[0][1])}%</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card id="billing" className="scroll-mt-24" data-card="billing">
        <SectionHeader label="Billing & Production" icon={Receipt}
          action={<CsvButton csv={billingCsv(bill)} fileName={`Billing_${bFrom}_${bTo}.csv`} disabled={!bill.length} data-export-billing />} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--panel-border)] px-5 py-3">
          <form method="get" className="flex items-center gap-2" data-billing-range>
            {Object.entries(params).filter(([k]) => !["bf", "bt"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <DateRangePicker key={`${bFrom}:${bTo}`} fromName="bf" toName="bt" defaultFrom={bFrom} defaultTo={bTo} max="today" active={Boolean(sp?.bf)} />
          </form>
          <ParamSelect name="brep" label="Sales Rep" value={bRep ? String(bRep) : ""} options={repOptions} placeholder="All" clears={[]} />
          <span className="text-xs text-muted-foreground">{formatRange(bFrom, bTo)} · billed at each project&apos;s rates · cost is the managers&apos; pay</span>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[64rem] text-sm" data-billing-table>
            <TableHeader>
              <TableRow>
                {["Client", "Project", "Leads", "Lead billing", "Appts", "Appt billing", "Total billing", "Confirmed", "Invalid", "Pending", "Names called", "Cost"].map((h, i) => (
                  // The figures' two-word names over two lines, so the twelve columns fit across a laptop's screen.
                  <TableHead key={h} className={cn(i > 1 && "whitespace-normal text-right leading-tight")}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {bill.map((r) => (
                <TableRow key={r.project_id} data-billing-row={r.project_id}>
                  <TableCell className="max-w-36 truncate" title={r.client}>{r.client}</TableCell>
                  <TableCell className="max-w-52 truncate font-medium" title={r.project}><Link href={`/projects/${r.project_id}`} className="hover:text-primary">{r.project}</Link></TableCell>
                  <TableCell className="text-right tabular-nums">{figure(r, "leads", r.leads)}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(r.leadBilling)}</TableCell>
                  <TableCell className="text-right tabular-nums">{figure(r, "appts", r.appts)}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(r.apptBilling)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{usd(r.totalBilling)}</TableCell>
                  <TableCell className="text-right tabular-nums">{figure(r, "confirmed", r.confirmed)}</TableCell>
                  <TableCell className="text-right tabular-nums">{figure(r, "invalid_appts", r.invalid_appts)}</TableCell>
                  <TableCell className="text-right tabular-nums">{figure(r, "pending", r.pending)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.names_called.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(r.cost)}</TableCell>
                </TableRow>
              ))}
              {bill.length ? (
                <TableRow className="bg-muted/50 font-bold" data-billing-total>
                  <TableCell>Total</TableCell><TableCell />
                  <TableCell className="text-right tabular-nums">{sum("leads").toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(sum("leadBilling"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{sum("appts").toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(sum("apptBilling"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(sum("totalBilling"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{sum("confirmed").toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{sum("invalid_appts").toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{sum("pending").toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{sum("names_called").toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(sum("cost"))}</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          {bill.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No active clients&apos; projects for this choice.</p> : null}
        </div>
        <p className="border-t border-[var(--panel-border)] px-5 py-2.5 text-xs text-muted-foreground">
          Billing rates are set on each project (Edit › Billing per lead / per appointment); a project without them shows —. Leads and appointments count when our managers developed or set them; invalid ones aren&apos;t billed.
        </p>
      </Card>
    </div>
  );
}
