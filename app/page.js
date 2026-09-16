import Link from "next/link";
import { Target, CalendarCheck, Users, Percent, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRecentLeads, getAppointments, getDashboardStats, getCurrentUser } from "@/lib/queries";

const statCards = (s) => [
  { label: "Active Leads", value: s.totalLeads.toLocaleString(), delta: `${s.leadDelta >= 0 ? "+" : ""}${s.leadDelta}%`, up: s.leadDelta >= 0, note: "vs last month", icon: Target, tint: "bg-sky-500/10 text-sky-600", wm: "text-sky-500", rgb: "14 165 233" },
  { label: "Appointments / wk", value: String(s.apptsThisWeek), delta: `${s.apptDelta >= 0 ? "+" : ""}${s.apptDelta}`, up: s.apptDelta >= 0, note: "vs last week", icon: CalendarCheck, tint: "bg-emerald-500/10 text-emerald-600", wm: "text-emerald-500", rgb: "16 185 129" },
  { label: "Active Clients", value: String(s.activeClients), delta: `${s.apptToday} today`, up: true, note: "appointments booked", icon: Users, tint: "bg-violet-500/10 text-violet-600", wm: "text-violet-500", rgb: "139 92 246" },
  { label: "Conversion Rate", value: `${s.conversion}%`, delta: `${s.totalLeads} leads`, up: s.conversion >= 20, note: "leads to appointments", icon: Percent, tint: "bg-amber-500/10 text-amber-600", wm: "text-amber-500", rgb: "245 158 11" },
];

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

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [recentLeads, appointments, s, me] = await Promise.all([
    getRecentLeads(6),
    getAppointments(),
    getDashboardStats(),
    getCurrentUser(),
  ]);
  const stats = statCards(s);
  const c = chart(s.weeks);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <Topbar title="Dashboard" sub={`${today} · ${greeting}${me?.first_name ? `, ${me.first_name}` : ""}`} />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {/* stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => {
            const Icon = s.icon;
            const Trend = s.up ? TrendingUp : TrendingDown;
            return (
              <Card key={s.label} className="relative overflow-hidden">
                <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(150px 120px at 100% 0%, rgb(${s.rgb} / 0.16), transparent)` }} />
                <div aria-hidden className={`pointer-events-none absolute -bottom-7 -right-4 opacity-[0.08] ${s.wm}`}>
                  <Icon className="size-28" />
                </div>
                <CardContent className="relative p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
                    <span className={`flex size-8 items-center justify-center rounded-lg ${s.tint}`}>
                      <Icon className="size-4" />
                    </span>
                  </div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{s.value}</div>
                  <div className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${s.up ? "text-emerald-600" : "text-rose-600"}`}>
                    <Trend className="size-3.5" />
                    {s.delta}
                    <span className="font-normal text-muted-foreground">{s.note}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* chart + upcoming */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>New leads</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Last 8 weeks · Peak {c.peak} · Avg {c.avg}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-full bg-primary" /> Leads / week
              </span>
            </CardHeader>
            <CardContent>
              <svg viewBox="0 0 640 210" preserveAspectRatio="none" className="h-52 w-full" aria-label="New leads per week">
                <defs>
                  <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--primary)" stopOpacity="0.25" />
                    <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[30, 70, 110, 150, 190].map((y) => (
                  <line key={y} x1="20" y1={y} x2="620" y2={y} className="stroke-border" strokeWidth="1" />
                ))}
                <path d={c.area} fill="url(#lg)" />
                <path d={c.line} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={c.lastX} cy={c.lastY} r="4.5" className="fill-primary stroke-card" strokeWidth="2.5" />
                {[["20", "W1"], ["180", "W3"], ["345", "W5"], ["510", "W7"], ["596", "Now"]].map(([x, t]) => (
                  <text key={t} x={x} y="205" className="fill-muted-foreground text-[11px]">{t}</text>
                ))}
              </svg>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming</CardTitle>
              <Link href="/appointments" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                All <ArrowRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {appointments.today.map((a) => (
                <div key={a.time} data-list-row className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1">
                  <span className={`h-9 w-1 rounded-full ${a.bar}`} />
                  <div className="w-14 shrink-0 text-sm font-semibold tabular-nums">
                    {a.time}
                    <span className="block text-[0.6rem] font-normal text-muted-foreground">{a.ampm}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.co}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.detail.split(" · ").slice(0, 2).join(" · ")}</div>
                  </div>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold text-white" style={{ background: a.repC }}>
                    {a.repI}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* recent leads */}
        <Card>
          <CardHeader>
            <CardTitle>Recent leads</CardTitle>
            <Link href="/leads" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Open leads <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>X-Date</TableHead>
                  <TableHead>Assigned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLeads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: l.color }}>{l.initials}</span>
                        <div>
                          <div className="font-medium">{l.co}</div>
                          <div className="text-xs text-muted-foreground">{l.city}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{l.contact}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{l.xdate}</TableCell>
                    <TableCell className={l.rep === "Unassigned" ? "text-muted-foreground" : ""}>{l.rep}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
