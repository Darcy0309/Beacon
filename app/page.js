import Link from "next/link";
import {
  Target, CalendarCheck, Users, Percent, TrendingUp, TrendingDown,
  Activity, CalendarClock, ListChecks, Radio,
} from "lucide-react";
import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import MetricBar from "@/components/metric-bar";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import FilterTable from "@/components/filter-table";
import { STATUS } from "@/lib/data";
import {
  getRecentLeads, getAppointments, getDashboardStats, getCurrentUser, getReps,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/* Draws the 8-week lead line on the geometry this layout was built around. */
function chart(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.leads));
  const x = (i) => 20 + (i * 600) / Math.max(1, weeks.length - 1);
  const y = (v) => 190 - (v / max) * 153;
  const pts = weeks.map((w, i) => `${x(i).toFixed(0)},${y(w.leads).toFixed(0)}`);
  return {
    line: `M${pts.join(" L")}`,
    area: `M${pts.join(" L")} L620,190 L20,190 Z`,
    lastX: Number(x(weeks.length - 1).toFixed(0)),
    lastY: Number(y(weeks[weeks.length - 1]?.leads ?? 0).toFixed(0)),
    peak: max,
    avg: Math.round(weeks.reduce((acc, w) => acc + w.leads, 0) / Math.max(1, weeks.length)),
  };
}

const BAR_COLORS = [
  "var(--neon-cyan)", "var(--neon-emerald)", "var(--neon-amber)",
  "var(--neon-violet)", "var(--neon-magenta)",
];

export default async function Dashboard() {
  const [recentLeads, appointments, s, me, reps] = await Promise.all([
    getRecentLeads(6),
    getAppointments(),
    getDashboardStats(),
    getCurrentUser(),
    getReps(),
  ]);

  const c = chart(s.weeks);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const tiles = [
    { label: "Active Leads", value: s.totalLeads.toLocaleString(),
      note: `${s.leadDelta >= 0 ? "+" : ""}${s.leadDelta}% vs last month`,
      icon: Target, accent: "var(--neon-cyan)", series: s.series.leads },
    { label: "Appointments / Week", value: String(s.apptsThisWeek),
      note: `${s.apptDelta >= 0 ? "+" : ""}${s.apptDelta} vs last week`,
      icon: CalendarCheck, accent: "var(--neon-emerald)", series: s.series.appts },
    { label: "Active Clients", value: String(s.activeClients),
      note: "Leads per campaign",
      icon: Users, accent: "var(--neon-violet)", series: s.series.clients, bars: true },
    { label: "Conversion Rate", value: `${s.conversion}%`,
      note: `${s.apptToday} booked today`,
      icon: Percent, accent: "var(--neon-amber)", series: s.series.conversion },
  ];

  const Trend = s.leadDelta >= 0 ? TrendingUp : TrendingDown;

  return (
    <>
      <Topbar
        title="Command Center"
        sub={`${today} · ${greeting}${me?.first_name ? `, ${me.first_name}` : ""}`}
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        {/* headline banner */}
        <Card accent="var(--neon-cyan)" trace>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(90% 120% at 15% 0%, color-mix(in srgb, var(--neon-cyan) 14%, transparent), transparent 60%)",
            }}
          />
          <div className="grid-veil pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative flex flex-wrap items-end justify-between gap-6 p-6">
            <div className="max-w-xl">
              <span className="eyebrow eyebrow-accent">Signature Marketing · Lighthouse Platform</span>
              <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                Qualified leads and set appointments,
                <br className="hidden sm:block" /> routed to the agencies that bought them.
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  ["X-Date Engine", "var(--neon-amber)"],
                  ["Appointment Setting", "var(--neon-emerald)"],
                  ["Client Portal", "var(--neon-violet)"],
                  ["Lead Import", "var(--neon-blue)"],
                ].map(([t, col]) => (
                  <span
                    key={t}
                    className="rounded-full border px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.1em]"
                    style={{
                      borderColor: `color-mix(in srgb, ${col} 40%, transparent)`,
                      background: `color-mix(in srgb, ${col} 8%, transparent)`,
                      color: col,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Trend className={s.leadDelta >= 0 ? "size-4 text-emerald-400" : "size-4 text-rose-400"} />
              <span className={s.leadDelta >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>
                {s.leadDelta >= 0 ? "+" : ""}{s.leadDelta}%
              </span>
              <span className="text-muted-foreground">lead volume, 30 days</span>
            </div>
          </div>
        </Card>

        {/* metric tiles */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} trace className="animate-pop-in"
              style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        {/* chart + today */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionHeader label="Lead Volume — Last 8 Weeks" icon={Activity} />
            <div className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-4 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-primary" /> Leads / week
                </span>
                <span>Peak {c.peak}</span>
                <span>Avg {c.avg}</span>
              </div>
              <svg viewBox="0 0 640 210" preserveAspectRatio="none" className="h-52 w-full" aria-label="New leads per week">
                <defs>
                  <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--primary)" stopOpacity="0.3" />
                    <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[30, 70, 110, 150, 190].map((y) => (
                  <line key={y} x1="20" y1={y} x2="620" y2={y} stroke="var(--panel-border)" strokeWidth="1" />
                ))}
                <path d={c.area} fill="url(#lg)" />
                <path d={c.line} fill="none" className="stroke-primary" strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={c.lastX} cy={c.lastY} r="4.5" className="fill-primary" />
                {s.weeks.map((w, i) => (
                  <text key={w.label}
                    x={20 + (i * 600) / Math.max(1, s.weeks.length - 1)} y="205"
                    className="fill-muted-foreground"
                    style={{ fontSize: "10px", letterSpacing: "0.1em" }}>
                    {w.label}
                  </text>
                ))}
              </svg>
            </div>
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
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-bold text-white"
                    style={{ background: a.repC }} title={a.rep}>
                    {a.repI}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* recent leads + rep performance */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionHeader label="Recent Leads" icon={ListChecks} href="/leads" action="Open leads" />
            <FilterTable
              columns={["Company", "Contact", "Status", "X-Date", "Assigned"]}
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
                      <TableCell className={l.rep === "Unassigned" ? "text-muted-foreground" : ""}>{l.rep}</TableCell>
                    </TableRow>
                  ),
                };
              })}
            />
          </Card>

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
        </div>
      </div>
    </>
  );
}
