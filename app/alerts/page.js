import Topbar from "@/components/topbar";
import ToggleSwitch from "@/components/toggle-switch";
import ToneBadge from "@/components/tone-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAlerts } from "@/lib/queries";
import { setAlertRuleEnabled } from "@/lib/actions";
import { timeAgo } from "@/lib/display";

export const dynamic = "force-dynamic";

const TRIGGER_LABEL = {
  xdate_30d: "Fires when a policy X-date falls inside 30 days.",
  appt_created: "Fires when a rep books a new appointment.",
  appt_reminder: "Daily reminder of the day's appointments.",
  hot_lead: "Fires when a lead is flagged as a hot X-date.",
  import_done: "Summary sent when a lead import finishes.",
  feedback_new: "Fires when a client submits feedback.",
};

const dot = { sent: "bg-emerald-500", queued: "bg-sky-500", failed: "bg-rose-500" };

export default async function AlertsPage() {
  const { rules, log } = await getAlerts();
  const enabled = rules.filter((r) => r.enabled).length;

  return (
    <>
      <Topbar
        title="Alert Engine"
        sub={`${enabled} of ${rules.length} rules active · automated lead and appointment notifications`}
      />
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Alert rules</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {rules.map((r) => (
                  <div
                    key={r.id}
                    data-list-row
                    className="flex items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        <ToneBadge tone={r.channel === "email" ? "sky" : "teal"}>
                          {r.channel}
                        </ToneBadge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {TRIGGER_LABEL[r.trigger] ?? r.trigger}
                      </div>
                      {r.recipients ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">→ {r.recipients}</div>
                      ) : null}
                    </div>
                    <ToggleSwitch
                      id={r.id}
                      defaultChecked={r.enabled}
                      name={r.name}
                      action={setAlertRuleEnabled}
                      field="enabled"
                    />
                  </div>
                ))}
                {rules.length === 0 && (
                  <p className="px-5 py-10 text-center text-muted-foreground">No alert rules configured.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {log.map((a) => (
                <div
                  key={a.id}
                  data-list-row
                  className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-1.5"
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[a.status] ?? dot.sent}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{a.subject}</div>
                    {a.detail ? (
                      <div className="truncate text-xs text-muted-foreground">{a.detail}</div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</div>
                  </div>
                </div>
              ))}
              {log.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing dispatched yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
