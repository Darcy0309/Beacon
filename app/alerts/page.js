import Topbar from "@/components/topbar";
import ToggleSwitch from "@/components/toggle-switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { alertRules, recentAlerts } from "@/lib/data";

const dot = { hot: "bg-rose-500", appt: "bg-emerald-500", survey: "bg-violet-500", new: "bg-slate-400" };

export default function AlertsPage() {
  return (
    <>
      <Topbar title="Alert Engine" sub="Automated notifications for leads and appointments" />
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Alert rules</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {alertRules.map((r) => (
                  <div key={r.name} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-sm text-muted-foreground">{r.desc}</div>
                    </div>
                    <ToggleSwitch defaultChecked={r.on} name={r.name} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent alerts</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {recentAlerts.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[a.tone] || dot.new}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{a.text}</div>
                    <div className="text-xs text-muted-foreground">{a.time}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
