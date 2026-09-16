import {
  Download, Target, CalendarCheck, Star, CheckCheck, BarChart3, Map, PieChart, Radio,
} from "lucide-react";
import Topbar from "@/components/topbar";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import MetricBar from "@/components/metric-bar";
import { Card } from "@/components/ui/card";
import { getReps, getReports } from "@/lib/queries";

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

export default async function ReportsPage() {
  const [reps, r] = await Promise.all([getReps(), getReports()]);

  const maxMonth = Math.max(1, ...r.months.map((m) => Math.max(m.leads, m.appts)));
  const maxState = Math.max(1, ...r.byState.map(([, n]) => n));

  const tiles = [
    { label: "Leads Delivered", value: r.leads.toLocaleString(), note: `${r.projects} campaigns`,
      icon: Target, accent: "var(--neon-cyan)", series: r.months.map((m) => m.leads) },
    { label: "Appointments Set", value: r.appts.toLocaleString(), note: `${r.conversion}% of leads`,
      icon: CalendarCheck, accent: "var(--neon-emerald)", series: r.months.map((m) => m.appts) },
    { label: "Avg. Client Rating", value: r.avgRating ? `${r.avgRating}/5` : "—", note: "client feedback",
      icon: Star, accent: "var(--neon-amber)", series: [3, 4, 4, 5, 4, 5], bars: true },
    { label: "Show Rate", value: `${r.showRate}%`, note: "appointments held",
      icon: CheckCheck, accent: "var(--neon-violet)", series: r.months.map((m) => m.appts), bars: true },
  ];

  return (
    <>
      <Topbar title="Reports" sub="Performance across projects and reps" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in"
              style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionHeader label="Leads vs Appointments — 6 Months" icon={BarChart3} />
            <div className="p-5">
              <div className="mb-4 flex items-center gap-4 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: "var(--neon-cyan)" }} /> Leads
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: "var(--neon-emerald)" }} /> Appointments
                </span>
              </div>
              <div className="flex h-56 items-stretch gap-3">
                {r.months.map((m) => (
                  <div key={m.key} className="flex min-h-0 flex-1 flex-col items-center gap-2">
                    <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-1.5">
                      <div
                        className="w-1/3 rounded-t transition-all duration-500"
                        style={{
                          height: `${(m.leads / maxMonth) * 100}%`,
                          background: "var(--neon-cyan)",
                          boxShadow: "0 0 12px -3px var(--neon-cyan)",
                        }}
                        title={`${m.leads} leads`}
                      />
                      <div
                        className="w-1/3 rounded-t transition-all duration-500"
                        style={{
                          height: `${(m.appts / maxMonth) * 100}%`,
                          background: "var(--neon-emerald)",
                          boxShadow: "0 0 12px -3px var(--neon-emerald)",
                        }}
                        title={`${m.appts} appointments`}
                      />
                    </div>
                    <span className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader label="Leads by Status" icon={PieChart} />
            <div className="space-y-2.5 p-4">
              {Object.entries(r.byStatus).map(([name, count]) => (
                <MetricBar key={name} label={name} value={count} max={r.leads || 1}
                  color={STATUS_COLORS[name] ?? "var(--neon-cyan)"} />
              ))}
              {Object.keys(r.byStatus).length === 0 && (
                <p className="text-sm text-muted-foreground">No leads yet.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <SectionHeader
              label="Appointments by Rep"
              icon={Radio}
              action={
                <button className="flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-opacity hover:opacity-75">
                  <Download className="size-3" /> Export CSV
                </button>
              }
            />
            <div className="space-y-2.5 p-4">
              {reps.map((rep, i) => (
                <MetricBar key={rep.name} label={rep.name} value={rep.appts}
                  max={reps[0]?.appts || 1} color={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
              {reps.length === 0 && <p className="text-sm text-muted-foreground">No appointments yet.</p>}
            </div>
          </Card>

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
        </div>
      </div>
    </>
  );
}
