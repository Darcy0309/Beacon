import Topbar from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { appointments } from "@/lib/data";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const START = 4; // Aug 1, 2026 falls on Thursday (keeps Aug 20 on Tuesday)
const DAYS = 31;
const TODAY = 20;
const events = { 20: 2, 21: 2, 22: 1, 25: 3, 27: 1, 28: 2 };

export default function CalendarPage() {
  const cells = [];
  for (let i = 0; i < START; i++) cells.push(null);
  for (let d = 1; d <= DAYS; d++) cells.push(d);

  return (
    <>
      <Topbar title="Calendar" sub="August 2026" />
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>August 2026</CardTitle>
              <span className="text-xs text-muted-foreground">28 appointments</span>
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
              <span className="text-xs text-muted-foreground">Tue, Aug 20</span>
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
