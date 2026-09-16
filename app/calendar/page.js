import Link from "next/link";
import { CalendarRange, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import Topbar from "@/components/topbar";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getAppointments, getCalendarMonth } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CalendarPage({ searchParams }) {
  const sp = await searchParams;
  const now = new Date();

  // ?m=YYYY-MM moves between months.
  const parsed = /^\d{4}-\d{2}$/.test(sp?.m ?? "") ? sp.m.split("-").map(Number) : null;
  const year = parsed ? parsed[0] : now.getFullYear();
  const month = parsed ? parsed[1] - 1 : now.getMonth();

  const [{ byDay, count }, appointments] = await Promise.all([
    getCalendarMonth(year, month),
    getAppointments(),
  ]);

  const START = new Date(year, month, 1).getDay();
  const DAYS = new Date(year, month + 1, 0).getDate();
  const isCurrent = year === now.getFullYear() && month === now.getMonth();
  const TODAY = isCurrent ? now.getDate() : null;

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayLabel = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const key = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev = month === 0 ? key(year - 1, 11) : key(year, month - 1);
  const next = month === 11 ? key(year + 1, 0) : key(year, month + 1);

  const cells = [];
  for (let i = 0; i < START; i++) cells.push(null);
  for (let d = 1; d <= DAYS; d++) cells.push(d);

  const busiest = Math.max(1, ...Object.values(byDay));

  return (
    <>
      <Topbar title="Calendar" sub={`${monthLabel} · ${count} appointments`} />
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionHeader
              label={monthLabel}
              icon={CalendarRange}
              action={
                <div className="flex items-center gap-1">
                  <Link href={`/calendar?m=${prev}`} aria-label="Previous month"
                    className="flex size-7 items-center justify-center rounded-md border border-[var(--panel-border)] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                    <ChevronLeft className="size-3.5" />
                  </Link>
                  <Link href="/calendar"
                    className="rounded-md border border-[var(--panel-border)] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                    Today
                  </Link>
                  <Link href={`/calendar?m=${next}`} aria-label="Next month"
                    className="flex size-7 items-center justify-center rounded-md border border-[var(--panel-border)] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>
              }
            />
            <div className="p-4">
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {DOW.map((d) => (
                  <div key={d} className="pb-2 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">{d}</div>
                ))}
                {cells.map((d, i) => {
                  const n = d ? byDay[d] ?? 0 : 0;
                  const isToday = d === TODAY;
                  const heat = n ? 0.25 + (n / busiest) * 0.55 : 0;
                  return (
                    <div
                      key={i}
                      title={n ? `${n} appointment${n === 1 ? "" : "s"}` : undefined}
                      className={cn(
                        "group relative flex min-h-[4.25rem] flex-col rounded-lg border p-1.5 text-left transition-all duration-150",
                        d === null && "border-transparent",
                        d && !isToday && "border-[var(--panel-border)] hover:border-primary/50 hover:bg-primary/5",
                        isToday && "border-primary/60 bg-primary/10 shadow-[0_0_18px_-6px_var(--primary)]"
                      )}
                      style={n && !isToday ? { background: `color-mix(in srgb, var(--primary) ${Math.round(heat * 18)}%, transparent)` } : undefined}
                    >
                      {d ? (
                        <span className={cn("text-xs font-semibold tabular-nums", isToday ? "text-primary" : "text-foreground/80")}>{d}</span>
                      ) : null}
                      {n ? (
                        <span className="mt-auto flex items-center justify-between">
                          <span className="flex gap-0.5">
                            {Array.from({ length: Math.min(n, 3) }).map((_, k) => (
                              <span key={k} className="size-1.5 rounded-full bg-primary transition-transform duration-150 group-hover:scale-150" />
                            ))}
                          </span>
                          <span className="text-[0.6rem] font-bold tabular-nums text-primary">{n}</span>
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader label={isCurrent ? "Today" : "This Month"} icon={CalendarClock}
              action={<span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">{isCurrent ? todayLabel : `${count} total`}</span>} />
            <div className="space-y-1 p-4">
              {appointments.today.map((a) => (
                <Link key={a.id} href={a.leadId ? `/leads/${a.leadId}` : "/appointments"} data-list-row
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2">
                  <span className={cn("h-9 w-[3px] rounded-full", a.bar)} />
                  <div className="w-14 shrink-0 text-sm font-bold tabular-nums">
                    {a.time}
                    <span className="block text-[0.58rem] font-semibold tracking-[0.1em] text-muted-foreground">{a.ampm}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.co}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.detail.split(" · ")[0]}</div>
                  </div>
                </Link>
              ))}
              {appointments.today.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled today.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
