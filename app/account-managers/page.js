import { UserCog, Building2, CalendarCheck, Target } from "lucide-react";
import Topbar from "@/components/topbar";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import MetricBar from "@/components/metric-bar";
import { Card } from "@/components/ui/card";
import { getAccountManagers } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ACCENTS = ["var(--neon-cyan)", "var(--neon-emerald)", "var(--neon-amber)", "var(--neon-violet)"];

export default async function AccountManagersPage() {
  const managers = await getAccountManagers();
  const totalLeads = managers.reduce((s, m) => s + m.leads, 0);
  const totalAppts = managers.reduce((s, m) => s + m.appts, 0);
  const totalClients = managers.reduce((s, m) => s + m.clients, 0);
  const maxLeads = Math.max(1, ...managers.map((m) => m.leads));
  const maxAppts = Math.max(1, ...managers.map((m) => m.appts));

  const tiles = [
    { label: "Account Managers", value: String(managers.length), note: "on the team",
      icon: UserCog, accent: "var(--neon-cyan)", series: managers.map((m) => m.leads), bars: true },
    { label: "Clients Covered", value: String(totalClients), note: "assignments",
      icon: Building2, accent: "var(--neon-emerald)", series: managers.map((m) => m.clients), bars: true },
    { label: "Appointments Set", value: String(totalAppts), note: "by the team",
      icon: CalendarCheck, accent: "var(--neon-amber)", series: managers.map((m) => m.appts) },
    { label: "Leads Assigned", value: String(totalLeads), note: "in active work",
      icon: Target, accent: "var(--neon-violet)", series: managers.map((m) => m.leads) },
  ];

  return (
    <>
      <Topbar title="Account Managers" sub="Team performance and book of business" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="Team" icon={UserCog} />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {managers.map((m, i) => {
              const accent = ACCENTS[i % ACCENTS.length];
              return (
                <Card key={m.name} accent={accent}>
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex size-11 items-center justify-center rounded-full border text-sm font-bold"
                        style={{
                          borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
                          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                          color: accent,
                        }}>
                        {m.initials}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.region} region</div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--panel-border)] pt-4 text-center">
                      <div><div className="text-lg font-bold tabular-nums" style={{ color: accent }}>{m.clients}</div><div className="eyebrow mt-0.5">Clients</div></div>
                      <div><div className="text-lg font-bold tabular-nums" style={{ color: accent }}>{m.appts}</div><div className="eyebrow mt-0.5">Appts</div></div>
                      <div><div className="text-lg font-bold tabular-nums" style={{ color: accent }}>{m.leads}</div><div className="eyebrow mt-0.5">Leads</div></div>
                    </div>
                    <div className="mt-3 space-y-1.5 border-t border-[var(--panel-border)] pt-3">
                      <MetricBar label="Leads" value={m.leads} max={maxLeads} color={accent} />
                      <MetricBar label="Appointments" value={m.appts} max={maxAppts} color="var(--neon-emerald)" />
                    </div>
                  </div>
                </Card>
              );
            })}
            {managers.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No account managers yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
