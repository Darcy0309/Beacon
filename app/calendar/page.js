import Topbar from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getAppointments, getCalendarMonth } from "@/lib/queries";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const [{ byDay, count }, appointments] = await Promise.all([
    getCalendarMonth(year, month),
    getAppointments(),
  ]);

  const START = new Date(year, month, 1).getDay();
  const DAYS = new Date(year, month + 1, 0).getDate();
  const TODAY = now.getDate();
  const events = byDay;
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayLabel = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const cells = [];
  for (let i = 0; i < START; i++) cells.push(null);
  for (let d = 1; d <= DAYS; d++) cells.push(d);

  return (
    <>
      <Topbar title="Calendar" sub={monthLabel} />
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{monthLabel}</CardTitle>
              <span className="text-xs text-muted-foreground">{count} appointments</span>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 text-center">
                {DOW.map((d) => (
                  <div key={d} className="pb-2 text-[0.66rem] font-semibold uppercase tracking-wide text-muted-foreground">{d}</div>
                ))}
                {cells.map((d, i) => (
                  <div
                    key={i}
                    className={cn(
                      "group flex min-h-16 flex-col rounded-lg border p-1.5 text-left transition-all duration-150",
                      d === null && "border-transparent",
                      d && d !== TODAY && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm active:translate-y-0 active:scale-95",
                      d === TODAY && "animate-beacon-pulse cursor-pointer border-primary bg-primary/5 active:scale-95"
                    )}
                  >
                    {d ? (
                      <span className={cn("text-xs font-medium tabular-nums", d === TODAY ? "text-primary" : "text-foreground")}>{d}</span>
                    ) : null}
                    {d && events[d] ? (
                      <span className="mt-auto flex gap-0.5">
                        {Array.from({ length: Math.min(events[d], 3) }).map((_, k) => (
                          <span key={k} className="size-1.5 rounded-full bg-primary/70 transition-transform duration-150 group-hover:scale-150" />
                        ))}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today</CardTitle>
              <span className="text-xs text-muted-foreground">{todayLabel}</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {appointments.today.map((a) => (
                <div key={a.time} className="flex items-center gap-3">
                  <span className={cn("h-9 w-1 rounded-full", a.bar)} />
                  <div className="w-14 shrink-0 text-sm font-semibold tabular-nums">
                    {a.time}
                    <span className="block text-[0.6rem] font-normal text-muted-foreground">{a.ampm}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.co}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.detail.split(" · ")[0]}</div>
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
