import Link from "next/link";
import { Target, CalendarCheck, Users, Percent, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDashboard, getCurrentUser } from "@/lib/queries";
import { colorFor, initials, cityState, shortDate, shortName, splitTime } from "@/lib/display";
import { STATUS_BAR } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Build the area + line path for the 8-week lead chart. */
function chartPaths(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.leads));
  const x = (i) => 20 + (i * 600) / Math.max(1, weeks.length - 1);
  const y = (v) => 190 - (v / max) * 150;
  const pts = weeks.map((w, i) => `${x(i).toFixed(0)},${y(w.leads).toFixed(0)}`);
  return {
    line: `M${pts.join(" L")}`,
    area: `M${pts.join(" L")} L620,190 L20,190 Z`,
    last: { x: x(weeks.length - 1), y: y(weeks[weeks.length - 1]?.leads ?? 0) },
    max,
    avg: Math.round(weeks.reduce((s, w) => s + w.leads, 0) / Math.max(1, weeks.length)),
  };
}

export default async function Dashboard() {
  const [data, me] = await Promise.all([getDashboard(), getCurrentUser()]);
  const { stats, deltas, weeks, recentLeads, upcoming, reps } = data;
  const chart = chartPaths(weeks);

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const tiles = [
    {
      label: "Active Leads",
      value: stats.totalLeads.toLocaleString(),
      delta: `${deltas.leads >= 0 ? "+" : ""}${deltas.leads}%`,
      up: deltas.leads >= 0,
      note: "vs prior 30 days",
      icon: Target,
      tint: "bg-sky-500/12 text-sky-600",
      accent: "14 165 233",
    },
    {
      label: "Appointments / wk",
      value: String(stats.apptsThisWeek),
      delta: `${deltas.appts >= 0 ? "+" : ""}${deltas.appts}`,
      up: deltas.appts >= 0,
      note: "vs last week",
      icon: CalendarCheck,
      tint: "bg-emerald-500/12 text-emerald-600",
      accent: "16 185 129",
    },
    {
      label: "Active Clients",
      value: String(stats.activeClients),
      delta: `${stats.hotLeads} hot`,
      up: true,
      note: "leads in play",
      icon: Users,
      tint: "bg-teal-500/12 text-teal-600",
      accent: "20 184 166",
    },
    {
      label: "Conversion Rate",
      value: `${stats.conversion}%`,
      delta: `${stats.apptToday} today`,
      up: stats.apptToday > 0,
      note: "appointments booked",
      icon: Percent,
      tint: "bg-amber-500/12 text-amber-700",
      accent: "245 158 11",
    },
  ];

  return (
    <>
      <Topbar
        title="Dashboard"
        sub={`${today} · ${greeting}${me?.first_name ? `, ${me.first_name}` : ""}`}
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((s, i) => {
            const Icon = s.icon;
            const Trend = s.up ? TrendingUp : TrendingDown;
            return (
              <Card
                key={s.label}
                className="animate-pop-in overflow-hidden"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, rgb(${s.accent} / 0.08) 0%, transparent 55%)`,
                  }}
                />
                <CardContent className="relative p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
                    <span className={`flex size-9 items-center justify-center rounded-xl ${s.tint}`}>
                      <Icon className="size-4" />
                    </span>
                  </div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{s.value}</div>
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs font-medium ${
                      s.up ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    <Trend className="size-3.5" />
                    {s.delta}
                    <span className="font-normal text-muted-foreground">{s.note}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>New leads</CardTitle>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Last 8 weeks · Peak {chart.max} · Avg {chart.avg}
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-sm bg-primary" /> Leads / week
              </span>
            </CardHeader>
            <CardContent>
              <svg viewBox="0 0 640 210" preserveAspectRatio="none" className="h-52 w-full" aria-label="New leads per week">
                <defs>
                  <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--primary)" stopOpacity="0.22" />
                    <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[30, 70, 110, 150, 190].map((y) => (
                  <line key={y} x1="20" y1={y} x2="620" y2={y} className="stroke-border" strokeWidth="1" />
                ))}
                <path d={chart.area} fill="url(#lg)" />
                <path
                  d={chart.line}
                  fill="none"
                  className="stroke-primary"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle cx={chart.last.x} cy={chart.last.y} r="4.5" className="fill-beacon stroke-card" strokeWidth="2.5" />
                {weeks.map((w, i) =>
                  i % 2 === 0 || i === weeks.length - 1 ? (
                    <text
                      key={w.label}
                      x={20 + (i * 600) / Math.max(1, weeks.length - 1)}
                      y="205"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {w.label}
                    </text>
                  ) : null
                )}
              </svg>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming</CardTitle>
              <Link
                href="/appointments"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                All <ArrowRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-1">
              {upcoming.today.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No appointments scheduled today.
                </p>
              )}
              {upcoming.today.map((a) => {
                const { time, ampm } = splitTime(a.appt_time);
                const rep = shortName(a.user);
                const code = a.lead?.status?.code || "new";
                return (
                  <div
                    key={a.id}
                    data-list-row
                    className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2"
                  >
                    <span className={`h-10 w-1 rounded-full ${STATUS_BAR[code] || STATUS_BAR.new}`} />
                    <div className="w-14 shrink-0 text-sm font-semibold tabular-nums">
                      {time}
                      <span className="block text-[0.6rem] font-normal text-muted-foreground">{ampm}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.lead?.company_name ?? "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[a.lead?.status?.name, a.lead?.contact_name].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[0.6rem] font-semibold text-white"
                      style={{ background: colorFor(rep) }}
                      title={rep}
                    >
                      {initials(rep)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent leads</CardTitle>
              <Link href="/leads" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Open leads <ArrowRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>X-Date</TableHead>
                    <TableHead>Assigned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLeads.map((l) => {
                    const rep = shortName(l.assigned);
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span
                              className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white"
                              style={{ background: colorFor(l.company_name || "") }}
                            >
                              {initials(l.company_name || "")}
                            </span>
                            <div>
                              <div className="font-medium">{l.company_name}</div>
                              <div className="text-xs text-muted-foreground">{cityState(l)}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{l.contact_name ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={l.status} />
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{shortDate(l.xdate)}</TableCell>
                        <TableCell className={rep === "Unassigned" ? "text-muted-foreground" : ""}>{rep}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appointments by rep</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reps.length === 0 && (
                <p className="text-sm text-muted-foreground">No appointments recorded yet.</p>
              )}
              {reps.map((r) => {
                const name = shortName(r);
                return (
                  <div key={r.id} data-list-row className="-mx-2 rounded-xl px-2 py-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{name}</span>
                      <span className="tabular-nums text-muted-foreground">{r.appts}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${r.pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
