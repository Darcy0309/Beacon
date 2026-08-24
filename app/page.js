import Link from "next/link";
import { Target, CalendarCheck, Users, Percent, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { recentLeads, appointments } from "@/lib/data";

const stats = [
  { label: "Active Leads", value: "342", delta: "+12.4%", up: true, note: "vs last month", icon: Target, tint: "bg-sky-500/10 text-sky-600" },
  { label: "Appointments / wk", value: "28", delta: "+6", up: true, note: "vs last week", icon: CalendarCheck, tint: "bg-emerald-500/10 text-emerald-600" },
  { label: "Active Clients", value: "17", delta: "+2", up: true, note: "new this quarter", icon: Users, tint: "bg-violet-500/10 text-violet-600" },
  { label: "Conversion Rate", value: "23.6%", delta: "-1.1%", up: false, note: "vs last month", icon: Percent, tint: "bg-amber-500/10 text-amber-600" },
];

export default function Dashboard() {
  return (
    <>
      <Topbar title="Dashboard" sub="Tuesday, August 20 · Good afternoon, Sean" />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {/* stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => {
            const Icon = s.icon;
            const Trend = s.up ? TrendingUp : TrendingDown;
            return (
              <Card key={s.label}>
                <CardContent className="p-5">
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
                <p className="mt-1 text-xs text-muted-foreground">Last 8 weeks · Peak 342 · Avg 275</p>
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
                <path d="M20,162 L106,129 L191,114 L277,133 L363,86 L449,67 L534,77 L620,37 L620,190 L20,190 Z" fill="url(#lg)" />
                <path d="M20,162 L106,129 L191,114 L277,133 L363,86 L449,67 L534,77 L620,37" fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx="620" cy="37" r="4.5" className="fill-primary stroke-card" strokeWidth="2.5" />
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
                <div key={a.time} className="flex items-center gap-3">
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
