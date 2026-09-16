import Topbar from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReports, getRepPerformance } from "@/lib/queries";
import { shortName } from "@/lib/display";

export const dynamic = "force-dynamic";

const BAR_COLORS = ["bg-primary", "bg-teal-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500"];

export default async function ReportsPage() {
  const [data, reps] = await Promise.all([getReports(), getRepPerformance()]);
  const { totals, byStatus, byState, apptByStatus, months } = data;

  const kpis = [
    { label: "Leads delivered", value: totals.leads.toLocaleString(), note: `${totals.projects} projects` },
    { label: "Appointments set", value: totals.appts.toLocaleString(), note: `${totals.heldRate}% held` },
    { label: "Conversion rate", value: `${totals.conversion}%`, note: "leads → appointments" },
    { label: "Avg. client rating", value: totals.avgRating ? `${totals.avgRating}/5` : "—", note: "client feedback" },
  ];

  const maxMonth = Math.max(1, ...months.map((m) => Math.max(m.leads, m.appts)));
  const maxState = Math.max(1, ...byState.map(([, n]) => n));

  return (
    <>
      <Topbar title="Reports" sub="Performance across projects and reps" />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">Performance</h2>
          <p className="text-sm text-muted-foreground">All projects · live figures</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-5">
                <div className="text-sm font-medium text-muted-foreground">{k.label}</div>
                <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{k.value}</div>
                <div className="mt-1.5 text-xs font-medium text-muted-foreground">{k.note}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Leads and appointments · last 6 months</CardTitle>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-primary" /> Leads
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-teal-500" /> Appts
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex h-52 items-end gap-3">
                {months.map((m) => (
                  <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-full w-full items-end justify-center gap-1">
                      <div
                        className="w-1/3 rounded-t bg-primary transition-all duration-500"
                        style={{ height: `${(m.leads / maxMonth) * 100}%` }}
                        title={`${m.leads} leads`}
                      />
                      <div
                        className="w-1/3 rounded-t bg-teal-500 transition-all duration-500"
                        style={{ height: `${(m.appts / maxMonth) * 100}%` }}
                        title={`${m.appts} appointments`}
                      />
                    </div>
                    <span className="text-[0.7rem] text-muted-foreground">{m.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leads by status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(byStatus).map(([name, count]) => (
                <div key={name} data-list-row className="-mx-2 rounded-lg px-2 py-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate">{name}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(count / Math.max(1, totals.leads)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {Object.keys(byStatus).length === 0 && (
                <p className="text-sm text-muted-foreground">No leads yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Appointments set by rep</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reps.map((r, i) => (
                <div key={r.id} data-list-row className="-mx-2 rounded-lg px-2 py-1.5">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">{shortName(r)}</span>
                    <span className="tabular-nums text-muted-foreground">{r.appts}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`}
                      style={{ width: `${r.pct}%` }}
                    />
                  </div>
                </div>
              ))}
              {reps.length === 0 && <p className="text-sm text-muted-foreground">No appointments yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top states</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {byState.map(([state, count]) => (
                <div key={state} data-list-row className="-mx-2 rounded-lg px-2 py-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{state}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${(count / maxState) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {byState.length === 0 && <p className="text-sm text-muted-foreground">No location data.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appointment outcomes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(apptByStatus).map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span>{name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {count}
                    <span className="ml-2 text-xs">
                      {Math.round((count / Math.max(1, totals.appts)) * 100)}%
                    </span>
                  </span>
                </div>
              ))}
              {Object.keys(apptByStatus).length === 0 && (
                <p className="text-sm text-muted-foreground">No appointments yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
