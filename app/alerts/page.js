import { BellRing, Send, XCircle, ToggleRight } from "lucide-react";
import Topbar from "@/components/topbar";
import ToggleSwitch from "@/components/toggle-switch";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { getAlerts } from "@/lib/queries";
import { setAlertRuleEnabled } from "@/lib/actions";

export const dynamic = "force-dynamic";

const dot = { hot: "var(--neon-rose)", appt: "var(--neon-emerald)", survey: "var(--neon-violet)", new: "var(--muted-foreground)" };

export default async function AlertsPage() {
  const { alertRules, recentAlerts } = await getAlerts();
  const enabled = alertRules.filter((r) => r.on).length;

  const tiles = [
    { label: "Alert Rules", value: String(alertRules.length), note: "configured",
      icon: BellRing, accent: "var(--neon-cyan)", series: alertRules.map((r) => (r.on ? 1 : 0.4)), bars: true },
    { label: "Active", value: String(enabled), note: `${alertRules.length - enabled} paused`,
      icon: ToggleRight, accent: "var(--neon-emerald)", series: alertRules.map((r) => (r.on ? 1 : 0)), bars: true },
    { label: "Recently Sent", value: String(recentAlerts.length), note: "latest dispatches",
      icon: Send, accent: "var(--neon-amber)", series: recentAlerts.map((_, i) => i + 1) },
    { label: "Delivery Issues", value: "0", note: "in the last 24h",
      icon: XCircle, accent: "var(--neon-violet)", series: [0, 0, 0, 0, 0, 0], bars: true },
  ];

  return (
    <>
      <Topbar title="Alert Engine" sub={`${enabled} of ${alertRules.length} rules active · automated notifications`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionHeader label="Alert Rules" icon={BellRing} />
            <div className="divide-y divide-[var(--panel-border)]">
              {alertRules.map((r) => (
                <div key={r.id} data-list-row className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-sm text-muted-foreground">{r.desc}</div>
                  </div>
                  <ToggleSwitch id={r.id} defaultChecked={r.on} name={r.name} action={setAlertRuleEnabled} field="enabled" />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader label="Recent Alerts" icon={Send} />
            <div className="space-y-1 p-4">
              {recentAlerts.map((a, i) => (
                <div key={i} data-list-row className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: dot[a.tone] ?? dot.new, boxShadow: `0 0 8px ${dot[a.tone] ?? dot.new}` }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{a.text}</div>
                    <div className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">{a.time}</div>
                  </div>
                </div>
              ))}
              {recentAlerts.length === 0 && <p className="text-sm text-muted-foreground">Nothing dispatched yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
