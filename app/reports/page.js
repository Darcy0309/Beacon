import { Download } from "lucide-react";
import Topbar from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReps, getReports } from "@/lib/queries";

const kpiCards = (r) => [
  { label: "Leads delivered", value: r.leads.toLocaleString(), delta: `${r.appts} appointments` },
  { label: "Appointments set", value: r.appts.toLocaleString(), delta: `${r.conversion}% of leads` },
  { label: "Avg. client rating", value: r.avgRating ? `${r.avgRating}/5` : "—", delta: "client feedback" },
  { label: "Show rate", value: `${r.showRate}%`, delta: "appointments held" },
];

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [reps, totals] = await Promise.all([getReps(), getReports()]);
  const kpis = kpiCards(totals);

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
              <div key={r.name} data-list-row className="-mx-2 rounded-lg px-2 py-1.5">
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
