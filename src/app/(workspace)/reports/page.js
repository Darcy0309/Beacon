import {
  Target, CalendarCheck, Star, CheckCheck, BarChart3, Map, PieChart, Radio, UserCheck,
} from "lucide-react";
import Topbar from "@/components/layout/topbar";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import MetricBar from "@/components/shared/metric-bar";
import CountUp from "@/components/shared/count-up";
import { Card } from "@/components/ui/card";
import ReportChart from "@/components/shared/report-chart";
import Tabs from "@/components/shared/tabs";
import { monthBarTips } from "@/lib/chart-tips";
import { reportsView } from "@/features/dashboard/role-views";
import { getReports } from "@/features/dashboard/queries";
import { getReps, getMyWorkload } from "@/features/users/queries";
import { getCurrentUser } from "@/lib/server/session";
import { getBusinessToday } from "@/lib/server/business-day";
import AdminReports from "@/features/reports/components/admin-reports";

export const dynamic = "force-dynamic";

// The call results, most first, each a colour of its own.
const RESULT_COLORS = ["var(--neon-cyan)", "var(--neon-emerald)", "var(--neon-violet)", "var(--neon-amber)", "var(--neon-rose)", "var(--neon-blue)"];

// The six-month chart's bars, in the order of its legend.
const MONTH_SERIES = [
  { key: "leads", label: "Leads", color: "var(--neon-cyan)" },
  { key: "appts", label: "Appointments", color: "var(--neon-emerald)" },
];

const BAR_COLORS = [
  "var(--neon-cyan)", "var(--neon-emerald)", "var(--neon-amber)",
  "var(--neon-violet)", "var(--neon-magenta)",
];


const SUBTITLE = {
  admin: "Performance across projects and reps",
  manager: "Performance across your accounts",
  agent: "Your performance alongside the team",
  client: "Delivery and appointment performance",
};

export default async function ReportsPage({ searchParams }) {
  // Cached per request — the layout has usually resolved this already.
  const me = await getCurrentUser();
  const role = me?.role ?? "client";
  const view = reportsView(role);

  // An administrator's Reports (Sean, Nov 2026): each figure over its own months, and the billing listing.
  if (role === "admin") {
    const [sp, today] = await Promise.all([searchParams, getBusinessToday()]);
    return (
      <>
        <Topbar title="Reports" sub={SUBTITLE.admin} />
        <div className="flex-1 p-4 sm:p-6"><AdminReports sp={sp} today={today} /></div>
      </>
    );
  }

  const [reps, r, mine] = await Promise.all([
    view.reps ? getReps() : null,
    getReports(),
    view.myPerformance ? getMyWorkload() : null,
  ]);

  const maxState = Math.max(1, ...r.byState.map(([, n]) => n));
  const repRows = reps ?? [];
  // The call results by stage, appointments first; a stage with no leads is left out.
  const stages = [["APPT", "Appts"], ["DBDV", "DB Dev"]].map(([code, label]) => {
    const rows = Object.entries(r.byResult[code] ?? {}).sort((x, y) => y[1] - x[1]);
    return { code, label, rows, total: rows.reduce((n, [, c]) => n + c, 0) };
  }).filter((s) => s.total > 0);
  // An agent's own bar is highlighted rather than singled out into its own chart.
  const myShare = (n, total) => (total ? Math.round((n / total) * 100) : 0);

  // The tiles' charts are the same six months: their tooltips name them.
  const monthNames = r.months.map((m) => m.label);
  const tiles = [
    { label: "Leads Delivered", value: r.leads.toLocaleString(), note: `${r.projects} campaigns`,
      icon: Target, accent: "var(--neon-cyan)", series: r.months.map((m) => m.leads), seriesLabels: monthNames },
    { label: "Appointments Set", value: r.appts.toLocaleString(), note: `${r.conversion}% of leads`,
      icon: CalendarCheck, accent: "var(--neon-emerald)", series: r.months.map((m) => m.appts), seriesLabels: monthNames },
    { label: "Avg. Client Rating", value: r.avgRating ? `${r.avgRating}/5` : "—", note: "client feedback",
      // Each month's average rating; a month with none draws as zero.
      icon: Star, accent: "var(--neon-amber)", series: r.months.map((m) => Number(m.rating) || 0), seriesLabels: monthNames, bars: true },
    { label: "Show Rate", value: `${r.showRate}%`, note: "appointments held",
      icon: CheckCheck, accent: "var(--neon-violet)", series: r.months.map((m) => m.appts), seriesLabels: monthNames, bars: true },
  ];

  return (
    <>
      <Topbar title="Reports" sub={SUBTITLE[role] ?? SUBTITLE.client} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="expand-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:flex" data-from="xl">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in"
              style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        {view.myPerformance ? (
          <Card accent="var(--neon-violet)">
            <SectionHeader label="My Performance" icon={UserCheck} />
            <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-3">
              <div>
                <div className="stat-label">Appointments I set</div>
                <div className="stat-value mt-2" style={{ color: "var(--neon-emerald)" }}><CountUp value={mine.appts} /></div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {myShare(mine.appts, r.appts)}% of the {r.appts.toLocaleString()} set overall
                </p>
              </div>
              <div>
                <div className="stat-label">Leads assigned to me</div>
                <div className="stat-value mt-2" style={{ color: "var(--neon-cyan)" }}><CountUp value={mine.leads} /></div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {myShare(mine.leads, r.leads)}% of the {r.leads.toLocaleString()} on the book
                </p>
              </div>
              <div>
                <div className="stat-label">My conversion</div>
                <div className="stat-value mt-2" style={{ color: "var(--neon-amber)" }}>
                  <CountUp value={`${mine.leads ? Math.round((mine.appts / mine.leads) * 100) : 0}%`} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">appointments per lead worked</p>
              </div>
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* The chart sets this row's height; the call results beside it scroll within it. */}
          <Card className="flex flex-col lg:col-span-2">
            <SectionHeader label="Leads vs Appointments — 6 Months" icon={BarChart3} />
            <div className="flex flex-1 flex-col p-5">
              {/* Figures up the left and a bar/line/area menu (client, Nov 2026); hovering a month shows its figures. */}
              <ReportChart id="reports-months" className="flex-1" height="min-h-56 flex-1 lg:min-h-72"
                series={MONTH_SERIES} tips={monthBarTips(r.months)} data-months-chart=""
                points={r.months.map((m) => ({
                  key: m.key, label: m.label, values: { leads: m.leads, appts: m.appts },
                  attrs: { role: "img", "aria-label": `${m.label}: ${m.leads} leads, ${m.appts} appointments` },
                }))} />
            </div>
          </Card>

          {/* One stage's results at a time (client, Nov 2026): all of them together ran ~25 rows and
              stretched the chart down the page. Beside the chart the card takes the chart's height
              (contain: size keeps the list out of the row's height) and the list scrolls within it. */}
          <Card data-results-by-stage className="flex flex-col max-lg:max-h-[28rem] lg:[contain:size]">
            <SectionHeader label="Results by Call Result" icon={PieChart} />
            {stages.length ? (
              <Tabs label="Stage" className="flex min-h-0 flex-1 flex-col"
                panelClassName="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4"
                tabs={stages.map((s) => ({
                  id: s.code, label: s.label, count: s.total.toLocaleString(),
                  content: s.rows.map(([name, count], i) => (
                    <MetricBar key={name} label={name} value={count} max={s.total}
                      color={RESULT_COLORS[i % RESULT_COLORS.length]} />
                  )),
                }))} />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No leads yet.</p>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Rep-by-rep productivity is internal; clients never see it. */}
          {view.reps ? (
            <Card>
              <SectionHeader label="Appointments by Rep" icon={Radio} />
              <div className="space-y-2.5 p-4">
                {repRows.map((rep, i) => (
                  <MetricBar key={rep.name} label={rep.name === me?.short ? `${rep.name} (me)` : rep.name}
                    value={rep.appts} max={repRows[0]?.appts || 1}
                    color={rep.name === me?.short ? "var(--neon-violet)" : BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
                {repRows.length === 0 && <p className="text-sm text-muted-foreground">No appointments yet.</p>}
              </div>
            </Card>
          ) : null}

          {view.states ? (
            <Card>
              <SectionHeader label="Top States" icon={Map} />
              <div className="space-y-2.5 p-4">
                {r.byState.map(([state, count], i) => (
                  <MetricBar key={state} label={state} value={count} max={maxState}
                    color={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
                {r.byState.length === 0 && <p className="text-sm text-muted-foreground">No location data.</p>}
              </div>
            </Card>
          ) : null}

          {view.outcomes ? (
            <Card>
              <SectionHeader label="Appointment Outcomes" icon={CheckCheck} />
              <div className="divide-y divide-[var(--panel-border)]">
                {Object.entries(r.apptByStatus).map(([name, count]) => (
                  <div key={name} data-list-row className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>{name}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <span className="font-semibold">{count}</span>
                      <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">
                        {Math.round((count / Math.max(1, r.appts)) * 100)}%
                      </span>
                    </span>
                  </div>
                ))}
                {Object.keys(r.apptByStatus).length === 0 && (
                  <p className="p-5 text-sm text-muted-foreground">No appointments yet.</p>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
