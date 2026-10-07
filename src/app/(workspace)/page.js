import Link from "@/components/shared/intent-link";
import {
  Target, CalendarCheck, Users, Percent,
  Activity, CalendarClock, ListChecks, Radio, FolderKanban, PieChart, CheckCheck, UserCheck,
} from "lucide-react";
import Topbar from "@/components/layout/topbar";
import StatusBadge from "@/components/shared/status-badge";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import MetricBar from "@/components/shared/metric-bar";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import FilterTable from "@/components/shared/filter-table";
import TipLayer from "@/components/shared/tip-layer";
import { monthBarTips } from "@/lib/chart-tips";
import { STATUS } from "@/lib/lead-status";
import { dashboardView } from "@/features/dashboard/role-views";
import { getAppointments } from "@/features/appointments/queries";
import LeadVolumeChart from "@/features/dashboard/components/lead-volume-chart";
import { getDashboardStats, getLeadVolume, getReports } from "@/features/dashboard/queries";
import { getRecentLeads } from "@/features/leads/queries";
import { getProjects } from "@/features/projects/queries";
import { getMyWorkload } from "@/features/users/queries";
import { getCurrentUser } from "@/lib/server/session";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";

export const dynamic = "force-dynamic";

const BAR_COLORS = [
  "var(--neon-cyan)", "var(--neon-emerald)", "var(--neon-amber)",
  "var(--neon-violet)", "var(--neon-magenta)",
];

const STATUS_COLORS = {
  "Phone appointment": "var(--neon-emerald)",
  "Survey appointment": "var(--neon-violet)",
  "X-date hot lead": "var(--neon-rose)",
  "X-date lead": "var(--neon-cyan)",
  "X-date profile": "var(--neon-amber)",
  New: "var(--neon-blue)",
};

export default async function Dashboard() {
  // Cached per request — the layout has usually resolved this already.
  const me = await getCurrentUser();
  const role = me?.role ?? "client";
  const view = dashboardView(role);

  const [recentLeads, appointments, s, report, projects, mine, volume, tz, businessToday] = await Promise.all([
    getRecentLeads(6),
    getAppointments(),
    getDashboardStats(),
    // Months, status mix and totals — only the client dashboard renders them.
    view.trend === "months" || view.statusMix ? getReports() : null,
    view.campaigns ? getProjects() : null,
    view.myPerformance ? getMyWorkload() : null,
    view.trend === "weeks" ? getLeadVolume() : null,
    getBusinessTimeZone(),
    getBusinessToday(),
  ]);

  // Appointments per rep ride along with the dashboard stats.
  const reps = s.reps;
  const months = report?.months ?? [];
  const maxMonth = Math.max(1, ...months.map((m) => Math.max(m.leads, m.appts)));

  // The business's clock, not the server's (which runs on UTC).
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });

  // Campaign progress: cumulative leads delivered per campaign, biggest first.
  const campaigns = (projects ?? []).slice().sort((a, b) => b.leads - a.leads).slice(0, 6);
  const maxCampaign = Math.max(1, ...campaigns.map((p) => p.leads));

  let tiles;
  if (view.audience === "client") {
    // What the client bought: totals and delivery quality, not weekly activity.
    tiles = [
      { label: "Leads Delivered", value: (report?.leads ?? 0).toLocaleString(),
        note: `${report?.projects ?? 0} campaign${(report?.projects ?? 0) === 1 ? "" : "s"}`,
        icon: Target, accent: "var(--neon-cyan)", series: months.map((m) => m.leads) },
      { label: "Appointments Set", value: (report?.appts ?? 0).toLocaleString(),
        note: `${report?.conversion ?? 0}% of leads`,
        icon: CalendarCheck, accent: "var(--neon-emerald)", series: months.map((m) => m.appts) },
      { label: "Booked Today", value: String(s.apptToday),
        note: `${appointments.tomorrow.length} tomorrow`,
        icon: CalendarClock, accent: "var(--neon-violet)", series: months.map((m) => m.appts), bars: true },
      { label: "Show Rate", value: `${report?.showRate ?? 0}%`, note: "appointments held",
        icon: CheckCheck, accent: "var(--neon-amber)", series: months.map((m) => m.appts), bars: true },
    ];
  } else {
    tiles = [
      { label: "Total Leads", value: s.totalLeads.toLocaleString(),
        note: s.leadDelta === null ? `${s.leadsNew.toLocaleString()} new this month` : `${s.leadDelta >= 0 ? "+" : ""}${s.leadDelta}% new vs last month`,
        icon: Target, accent: "var(--neon-cyan)", series: s.series.leads },
      { label: "Appointments / Week", value: String(s.apptsThisWeek),
        note: `${s.apptDelta >= 0 ? "+" : ""}${s.apptDelta} vs last week`,
        icon: CalendarCheck, accent: "var(--neon-emerald)", series: s.series.appts },
      // An agent sees their own workload where a manager sees the client count.
      view.myPerformance
        ? { label: "My Appointments", value: String(mine?.appts ?? 0),
            note: `${mine?.leads ?? 0} leads assigned to me`,
            icon: UserCheck, accent: "var(--neon-violet)", series: s.series.appts, bars: true }
        : { label: "Active Clients", value: String(s.activeClients), note: "Leads per campaign",
            icon: Users, accent: "var(--neon-violet)", series: s.series.clients, bars: true },
      { label: "Conversion Rate", value: `${s.conversion}%`,
        note: `${s.apptToday} booked today`,
        icon: Percent, accent: "var(--neon-amber)", series: s.series.conversion },
    ];
  }

  return (
    <>
      <Topbar
        title="Command Center"
        tag={view.audience === "client"
          ? [me?.company?.name, "Lighthouse Portal"].filter(Boolean).join(" · ")
          : "Signature Marketing · Lighthouse Platform"}
        sub={`${today} · ${greeting}${me?.first_name ? `, ${me.first_name}` : ""}`}
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        {/* metric tiles */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} trace className="animate-pop-in"
              style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        {/* volume over time + today */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* The monthly chart fills its card, which grows beside a long schedule. */}
          <Card className={view.trend === "weeks" ? "lg:col-span-2" : "flex flex-col lg:col-span-2"}>
            {view.trend === "weeks" ? (
              <LeadVolumeChart days={volume} fallback={s.weeks} today={businessToday} />
            ) : (
              <>
                {/* Monthly totals: quiet weeks in a campaign do not read as a dip. */}
                <SectionHeader label="Delivered — Last 6 Months" icon={Activity} />
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-4 flex items-center gap-4 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: "var(--neon-cyan)" }} /> Leads
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: "var(--neon-emerald)" }} /> Appointments
                    </span>
                  </div>
                  {/* Hovering a month shows what was delivered, above its taller bar. */}
                  <TipLayer tips={monthBarTips(months, { leads: "Leads delivered", appts: "Appointments" })} className="flex min-h-52 flex-1 items-stretch gap-3" data-months-chart>
                    {months.map((m, i) => (
                      <div key={m.key} data-tip={m.key} role="img" aria-label={`${m.label}: ${m.leads} leads, ${m.appts} appointments`}
                        className="flex min-h-0 flex-1 flex-col items-center gap-2">
                        <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-1.5">
                          <div data-tip-row="leads" data-tip-anchor={m.leads >= m.appts ? "" : undefined}
                            className="animate-grow-height w-1/3 rounded-t transition-[height] duration-500"
                            style={{ height: `${(m.leads / maxMonth) * 100}%`, background: "var(--neon-cyan)", boxShadow: "0 0 12px -3px var(--neon-cyan)", animationDelay: `${i * 70}ms` }} />
                          <div data-tip-row="appts" data-tip-anchor={m.leads < m.appts ? "" : undefined}
                            className="animate-grow-height w-1/3 rounded-t transition-[height] duration-500"
                            style={{ height: `${(m.appts / maxMonth) * 100}%`, background: "var(--neon-emerald)", boxShadow: "0 0 12px -3px var(--neon-emerald)", animationDelay: `${i * 70 + 35}ms` }} />
                        </div>
                        <span className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{m.label}</span>
                      </div>
                    ))}
                    {months.length === 0 && (
                      <p className="m-auto text-sm text-muted-foreground">Nothing delivered yet.</p>
                    )}
                  </TipLayer>
                </div>
              </>
            )}
          </Card>

          <Card>
            <SectionHeader label="Today's Schedule" icon={CalendarClock} href="/appointments" action="All" />
            <div className="space-y-1 p-4">
              {appointments.today.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Nothing scheduled today.</p>
              )}
              {appointments.today.map((a) => (
                <div key={a.id} data-list-row className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2">
                  <span className={`h-9 w-[3px] rounded-full ${a.bar}`} />
                  <div className="w-14 shrink-0 text-sm font-bold tabular-nums">
                    {a.time}
                    <span className="block text-[0.58rem] font-semibold tracking-[0.1em] text-muted-foreground">{a.ampm}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.co}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.detail.split(" · ").slice(0, 2).join(" · ")}
                    </div>
                  </div>
                  {/* Rep initials are internal staffing detail. */}
                  {view.reps ? (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-bold text-white"
                      style={{ background: a.repC }} title={a.rep}>
                      {a.repI}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* recent leads + the side panel this role gets */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionHeader label="Recent Leads" icon={ListChecks} href="/leads" action="Open leads" />
            <FilterTable
              columns={["Company", "Contact", "Status", "X-Date", ...(view.reps ? ["Assigned"] : [])]}
              filters={[{ key: "status", label: "Status" }]}
              placeholder="Search recent leads…"
              empty="No leads yet."
              rows={recentLeads.map((l) => {
                const status = STATUS[l.status]?.label ?? STATUS.new.label;
                return {
                  id: l.id,
                  search: `${l.co} ${l.city} ${l.contact} ${status} ${l.rep}`,
                  facets: { status },
                  node: (
                    <TableRow>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-md text-xs font-bold text-white"
                            style={{ background: l.color }}>
                            {l.initials}
                          </span>
                          <div>
                            <Link href={`/leads/${l.id}`} className="font-medium transition-colors hover:text-primary">
                              {l.co}
                            </Link>
                            <div className="text-xs text-muted-foreground">{l.city}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{l.contact}</TableCell>
                      <TableCell><StatusBadge status={l.status} /></TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{l.xdate}</TableCell>
                      {view.reps ? (
                        <TableCell className={l.rep === "Unassigned" ? "text-muted-foreground" : ""}>{l.rep}</TableCell>
                      ) : null}
                    </TableRow>
                  ),
                };
              })}
            />
          </Card>

          <div className="space-y-4">
            {view.reps ? (
              <Card>
                <SectionHeader label="Appointments by Rep" icon={Radio} />
                <div className="space-y-3 p-4">
                  {reps.length === 0 && (
                    <p className="text-sm text-muted-foreground">No appointments recorded yet.</p>
                  )}
                  {reps.map((r, i) => (
                    <MetricBar key={r.name} label={r.name} value={r.appts}
                      max={reps[0]?.appts || 1} color={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </div>
              </Card>
            ) : null}

            {view.campaigns ? (
              <Card>
                <SectionHeader label="Delivery by Campaign" icon={FolderKanban} href="/projects" action="All" />
                <div className="space-y-3 p-4">
                  {campaigns.length === 0 && (
                    <p className="text-sm text-muted-foreground">No campaigns yet.</p>
                  )}
                  {campaigns.map((p, i) => (
                    <MetricBar key={p.id} label={p.name} value={p.leads}
                      max={maxCampaign} color={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </div>
              </Card>
            ) : null}

            {view.statusMix ? (
              <Card>
                <SectionHeader label="Leads by Status" icon={PieChart} href="/reports" action="Reports" />
                <div className="space-y-2.5 p-4">
                  {Object.entries(report?.byStatus ?? {}).map(([name, count]) => (
                    <MetricBar key={name} label={name} value={count} max={report?.leads || 1}
                      color={STATUS_COLORS[name] ?? "var(--neon-cyan)"} />
                  ))}
                  {Object.keys(report?.byStatus ?? {}).length === 0 && (
                    <p className="text-sm text-muted-foreground">No leads yet.</p>
                  )}
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
