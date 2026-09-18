"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarRange, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Month grid with a side panel. Clicking a day lists that day's appointments
 * in the panel; clicking it again goes back to the whole month. `today` is the
 * day-of-month when the grid shows the current month, otherwise null.
 */
export default function CalendarView({ year, month, rows, byDay, count, today, prev, next, monthLabel }) {
  const [selected, setSelected] = useState(today);

  const START = new Date(year, month, 1).getDay();
  const DAYS = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < START; i++) cells.push(null);
  for (let d = 1; d <= DAYS; d++) cells.push(d);

  const busiest = Math.max(1, ...Object.values(byDay));
  const dayOf = (a) => Number(String(a.date).slice(8, 10));
  const label = (d) =>
    new Date(year, month, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const dayRows = selected ? rows.filter((a) => dayOf(a) === selected) : [];

  // Month overview: appointments grouped by day, in date order.
  const groups = [];
  for (const a of rows) {
    const d = dayOf(a);
    const last = groups[groups.length - 1];
    if (last && last[0] === d) last[1].push(a);
    else groups.push([d, [a]]);
  }

  const toggle = (d) => setSelected((s) => (s === d ? null : d));

  return (
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
              if (d === null) return <div key={i} className="min-h-[4.25rem] rounded-lg border border-transparent" />;
              const n = byDay[d] ?? 0;
              const isToday = d === today;
              const isSelected = d === selected;
              const heat = n ? 0.25 + (n / busiest) * 0.55 : 0;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(d)}
                  aria-pressed={isSelected}
                  aria-label={`${label(d)}, ${n} appointment${n === 1 ? "" : "s"}`}
                  title={n ? `${n} appointment${n === 1 ? "" : "s"}` : undefined}
                  className={cn(
                    "group relative flex min-h-[4.25rem] flex-col rounded-lg border p-1.5 text-left transition-all duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    !isToday && !isSelected && "border-[var(--panel-border)] hover:border-primary/50 hover:bg-primary/5",
                    isToday && !isSelected && "border-primary/60 bg-primary/10 shadow-[0_0_18px_-6px_var(--primary)]",
                    isSelected && "border-primary bg-primary/15 ring-1 ring-primary/50 shadow-[0_0_18px_-6px_var(--primary)]"
                  )}
                  style={n && !isToday && !isSelected ? { background: `color-mix(in srgb, var(--primary) ${Math.round(heat * 18)}%, transparent)` } : undefined}
                >
                  <span className={cn("text-xs font-semibold tabular-nums", isToday || isSelected ? "text-primary" : "text-foreground/80")}>{d}</span>
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
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader
          label={selected ? (selected === today ? "Today" : label(selected)) : "This Month"}
          icon={CalendarClock}
          action={
            <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">
              {selected
                ? `${dayRows.length} appointment${dayRows.length === 1 ? "" : "s"}`
                : `${count} total`}
            </span>
          }
        />
        <div className="max-h-[34rem] space-y-1 overflow-y-auto p-4">
          {selected ? (
            <>
              {dayRows.map((a) => <ApptRow key={a.id} a={a} />)}
              {dayRows.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing scheduled {selected === today ? "today" : `on ${label(selected)}`}.
                </p>
              )}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mt-2 w-full text-center text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary"
              >
                Show whole month
              </button>
            </>
          ) : (
            <>
              {groups.map(([d, list]) => (
                <div key={d} className="pt-2 first:pt-0">
                  <button
                    type="button"
                    onClick={() => setSelected(d)}
                    className="eyebrow mb-1 block transition-colors hover:text-primary"
                  >
                    {label(d)}
                  </button>
                  {list.map((a) => <ApptRow key={a.id} a={a} />)}
                </div>
              ))}
              {groups.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled this month.</p>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function ApptRow({ a }) {
  return (
    <Link href={a.leadId ? `/leads/${a.leadId}` : "/appointments"} data-list-row
      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2">
      <span className={cn("h-9 w-[3px] shrink-0 rounded-full", a.bar)} />
      <div className="w-14 shrink-0 text-sm font-bold tabular-nums">
        {a.time}
        <span className="block text-[0.58rem] font-semibold tracking-[0.1em] text-muted-foreground">{a.ampm}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{a.co}</div>
        <div className="truncate text-xs text-muted-foreground">{a.detail.split(" · ")[0]}</div>
      </div>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-bold text-white"
        style={{ background: a.repC }} title={a.rep}>
        {a.repI}
      </span>
    </Link>
  );
}
