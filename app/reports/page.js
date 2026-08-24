import { Download } from "lucide-react";
import Topbar from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reps } from "@/lib/data";

const kpis = [
  { label: "Leads delivered", value: "1,204", delta: "+8.9%" },
  { label: "Appointments set", value: "118", delta: "+14 vs prior" },
  { label: "Avg. response time", value: "2.4 hrs", delta: "22% faster" },
  { label: "Show rate", value: "81%", delta: "+3 pts" },
];

export default function ReportsPage() {
  return (
    <>
      <Topbar title="Reports" sub="Performance across projects and reps" />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">Performance</h2>
          <p className="text-sm text-muted-foreground">Rolling 30 days · all projects</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-5">
                <div className="text-sm font-medium text-muted-foreground">{k.label}</div>
                <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{k.value}</div>
                <div className="mt-1.5 text-xs font-medium text-emerald-600">{k.delta}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Appointments set by rep</CardTitle>
            <button className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <Download className="size-3.5" /> Export CSV
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            {reps.map((r) => (
              <div key={r.name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="tabular-nums text-muted-foreground">{r.appts}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
