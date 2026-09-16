import Link from "next/link";
import Topbar from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCalendarMonth } from "@/lib/queries";
import { splitTime, shortName } from "@/lib/display";
import { STATUS_BAR } from "@/lib/constants";

export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CalendarPage({ searchParams }) {
  const sp = await searchParams;
  const now = new Date();

  // ?m=YYYY-MM lets the arrows move between months.
  const parsed = /^\d{4}-\d{2}$/.test(sp?.m ?? "") ? sp.m.split("-").map(Number) : null;
  const year = parsed ? parsed[0] : now.getUTCFullYear();
  const month = parsed ? parsed[1] - 1 : now.getUTCMonth();

  const { rows, byDay } = await getCalendarMonth(year, month);

  const first = new Date(Date.UTC(year, month, 1));
  const startDow = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthLabel = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth();
  const todayNum = isCurrentMonth ? now.getUTCDate() : null;

  const cells = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const key = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev = month === 0 ? key(year - 1, 11) : key(year, month - 1);
  const next = month === 11 ? key(year + 1, 0) : key(year, month + 1);

  const todays = todayNum ? byDay[todayNum] ?? [] : [];

  return (
    <>
      <Topbar title="Calendar" sub={monthLabel} />
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{monthLabel}</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{rows.length} appointments</span>
                <div className="flex gap-1">
                  <Link
                    href={`/calendar?m=${prev}`}
                    aria-label="Previous month"
                    className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted"
                  >
                    ←
                  </Link>
                  <Link
                    href="/calendar"
                    className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted"
                  >
                    Today
                  </Link>
                  <Link
                    href={`/calendar?m=${next}`}
                    aria-label="Next month"
                    className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted"
                  >
                    →
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 text-center">
                {DOW.map((d) => (
                  <div
                    key={d}
                    className="pb-2 text-[0.66rem] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
                {cells.map((d, i) => {
                  const events = d ? byDay[d] ?? [] : [];
                  const isToday = d === todayNum;
                  return (
                    <div
                      key={i}
                      title={
                        events.length
                          ? `${events.length} appointment${events.length === 1 ? "" : "s"}`
                          : undefined
                      }
                      className={cn(
                        "group flex min-h-16 flex-col rounded-lg border p-1.5 text-left transition-all duration-150",
                        d === null && "border-transparent",
                        d && !isToday &&
                          "hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm",
                        isToday && "border-primary bg-primary/5"
                      )}
                    >
                      {d ? (
                        <span
                          className={cn(
                            "text-xs font-medium tabular-nums",
                            isToday ? "text-primary" : "text-foreground"
                          )}
                        >
                          {d}
                        </span>
                      ) : null}
                      {events.length > 0 ? (
                        <span className="mt-auto flex flex-wrap gap-0.5">
                          {events.slice(0, 4).map((e) => (
                            <span
                              key={e.id}
                              className={cn(
                                "size-1.5 rounded-full transition-transform duration-150 group-hover:scale-150",
                                STATUS_BAR[e.lead?.status?.code] ?? "bg-primary/70"
                              )}
                            />
                          ))}
                          {events.length > 4 ? (
                            <span className="text-[0.6rem] leading-none text-muted-foreground">
                              +{events.length - 4}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{isCurrentMonth ? "Today" : "This month"}</CardTitle>
              <span className="text-xs text-muted-foreground">
                {isCurrentMonth
                  ? now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                  : `${rows.length} total`}
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              {(isCurrentMonth ? todays : rows.slice(0, 10)).map((a) => {
                const { time, ampm } = splitTime(a.appt_time);
                return (
                  <Link
                    key={a.id}
                    href={a.lead ? `/leads/${a.lead.id}` : "/appointments"}
                    data-list-row
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5"
                  >
                    <span
                      className={cn(
                        "h-9 w-1 rounded-full",
                        STATUS_BAR[a.lead?.status?.code] ?? STATUS_BAR.new
                      )}
                    />
                    <div className="w-14 shrink-0 text-sm font-semibold tabular-nums">
                      {time}
                      <span className="block text-[0.6rem] font-normal text-muted-foreground">
                        {ampm}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{a.lead?.company_name ?? "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.rep_name || shortName(a.user)}
                      </div>
                    </div>
                  </Link>
                );
              })}
              {(isCurrentMonth ? todays : rows).length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
