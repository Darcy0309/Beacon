import Link from "next/link";
import { Building2, Target, CalendarCheck, UserCog } from "lucide-react";
import Topbar from "@/components/topbar";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import MetricBar from "@/components/metric-bar";
import { Card } from "@/components/ui/card";
import { clientSlug } from "@/lib/data";
import { getClients } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ACCENTS = [
  "var(--neon-cyan)", "var(--neon-emerald)", "var(--neon-amber)",
  "var(--neon-violet)", "var(--neon-magenta)", "var(--neon-blue)",
];

export default async function ClientsPage() {
  const clients = await getClients();
  const active = clients.filter((c) => c.status === "Active").length;
  const totalLeads = clients.reduce((s, c) => s + c.leads, 0);
  const totalAppts = clients.reduce((s, c) => s + c.appts, 0);
  const managers = new Set(clients.map((c) => c.manager).filter((m) => m !== "Unassigned")).size;
  const maxLeads = Math.max(1, ...clients.map((c) => c.leads));

  const tiles = [
    { label: "Active Accounts", value: String(active), note: `${clients.length} total`,
      icon: Building2, accent: "var(--neon-cyan)", series: clients.map((c) => c.leads), bars: true },
    { label: "Leads on Book", value: totalLeads.toLocaleString(), note: "across all accounts",
      icon: Target, accent: "var(--neon-emerald)", series: clients.map((c) => c.leads) },
    { label: "Appointments", value: totalAppts.toLocaleString(), note: "set to date",
      icon: CalendarCheck, accent: "var(--neon-amber)", series: clients.map((c) => c.appts) },
    { label: "Account Managers", value: String(managers), note: "covering the book",
      icon: UserCog, accent: "var(--neon-violet)", series: clients.map((c) => c.appts), bars: true },
  ];

  return (
    <>
      <Topbar title="Clients" sub={`${active} active agency accounts`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="Client Accounts" icon={Building2} />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {clients.map((c, i) => {
              const accent = ACCENTS[i % ACCENTS.length];
              return (
                <Link key={c.id} href={`/clients/${clientSlug(c.name)}`} className="block">
                  <Card accent={accent} className="h-full transition-all duration-200 hover:border-primary/40">
                    <div className="p-5">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-11 items-center justify-center rounded-lg border text-sm font-bold"
                          style={{
                            borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
                            background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                            color: accent,
                          }}
                        >
                          {c.initials}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.city}</div>
                        </div>
                        <span
                          className="ml-auto rounded-full border px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em]"
                          style={{
                            borderColor: c.status === "Active" ? "color-mix(in srgb, var(--neon-emerald) 45%, transparent)" : "var(--panel-border)",
                            color: c.status === "Active" ? "var(--neon-emerald)" : "var(--muted-foreground)",
                          }}
                        >
                          {c.status}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2 border-t border-[var(--panel-border)] pt-4">
                        <MetricBar label="Active leads" value={c.leads} max={maxLeads} color={accent} />
                        <MetricBar label="Appointments" value={c.appts} max={Math.max(1, c.leads)} color="var(--neon-emerald)" />
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="eyebrow">Manager</span>
                        <span className="font-medium">{c.manager}</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
            {clients.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No client accounts yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
