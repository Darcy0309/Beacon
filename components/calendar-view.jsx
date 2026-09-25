"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarRange, CalendarClock, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Time-grid geometry. One hour is HOUR_PX tall; a block never renders shorter
// than MIN_BLOCK_MIN so a 15-minute call is still readable.
const HOUR_PX = 56;
const MIN_BLOCK_MIN = 30;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 19;
/** timeRank() yields 1441 for a time it cannot parse; those get their own strip. */
const UNTIMED = 24 * 60;

const fmtHour = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
const endOf = (a) => a.startMin + Math.max(a.duration, MIN_BLOCK_MIN);

/**
 * Side-by-side placement for appointments that overlap in time: walk the day
 * in start order, keep a cluster of overlapping blocks, and give each the
 * first column that is free.
 */
function layoutDay(events) {
  const sorted = events.slice().sort((a, b) => a.startMin - b.startMin || a.duration - b.duration);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    const colEnds = [];
    const placed = cluster.map((e) => {
      let col = colEnds.findIndex((end) => end <= e.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(0);
      }
      colEnds[col] = endOf(e);
      return { e, col };
    });
    for (const p of placed) out.push({ ...p.e, col: p.col, cols: colEnds.length });
    cluster = [];
    clusterEnd = -1;
  };

  for (const e of sorted) {
    if (cluster.length && e.startMin >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, endOf(e));
  }
  if (cluster.length) flush();
  return out;
}

/**
 * The calendar. Day and week render a Google-Calendar-style time grid;
 * month keeps the heat-mapped grid with a side panel. The view and the date
 * live in the URL (?view=&d=), so every view is linkable.
 */
export default function CalendarView(props) {
  const { view, title, prev, next, todayHref, viewHrefs } = props;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--panel-border)] p-1">
          {["day", "week", "month"].map((v) => (
            <Link
              key={v}
              href={viewHrefs[v]}
              scroll={false}
              aria-current={v === view ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-[0.66rem] font-bold uppercase tracking-[0.14em] transition-colors",
                v === view ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Link href={prev} scroll={false} aria-label={`Previous ${view}`}
            className="flex size-7 items-center justify-center rounded-md border border-[var(--panel-border)] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
            <ChevronLeft className="size-3.5" />
          </Link>
          <Link href={todayHref} scroll={false}
            className="rounded-md border border-[var(--panel-border)] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
            Today
          </Link>
          <Link href={next} scroll={false} aria-label={`Next ${view}`}
            className="flex size-7 items-center justify-center rounded-md border border-[var(--panel-border)] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {view === "month" ? <MonthView {...props} /> : <TimeGrid {...props} />}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Day and week: an hour grid with appointments placed by start time.
   -------------------------------------------------------------------------- */
function TimeGrid({ view, title, days, byDate, rows, today }) {
  const [nowMin, setNowMin] = useState(null);

  // The "now" line, refreshed every minute.
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  const timed = rows.filter((a) => a.startMin < UNTIMED);
  const untimed = rows.filter((a) => a.startMin >= UNTIMED);

  // Widen the window to fit anything outside the usual working day.
  const startHour = Math.min(DEFAULT_START_HOUR, ...timed.map((a) => Math.floor(a.startMin / 60)));
  const endHour = Math.max(DEFAULT_END_HOUR, ...timed.map((a) => Math.ceil(endOf(a) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = hours.length * HOUR_PX;
  const top = (min) => ((min - startHour * 60) / 60) * HOUR_PX;

  return (
    <Card>
      <SectionHeader
        label={title}
        icon={CalendarClock}
        action={
          <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">
            {timed.length + untimed.length} scheduled
          </span>
        }
      />

      <div className="max-h-[70svh] overflow-y-auto">
        {/* The headings live inside the scroller: a scrollbar narrows whatever
            shares its box, so a header outside it would drift a little further
            from the columns with every day across the week. */}
        <div className="sticky top-0 z-20 bg-card">
          <div className="flex border-b border-[var(--panel-border)]">
            <div className="w-14 shrink-0" />
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((d) => (
                <Link
                  key={d.date}
                  href={d.href}
                  scroll={false}
                  className={cn(
                    "flex items-baseline justify-center gap-1.5 border-l border-[var(--panel-border)] py-2 transition-colors hover:bg-primary/5",
                    d.isToday && "bg-primary/10"
                  )}
                >
                  <span className={cn("eyebrow", d.isToday && "text-primary")}>{d.dow}</span>
                  <span className={cn("text-sm font-bold tabular-nums", d.isToday ? "text-primary" : "text-foreground/80")}>
                    {d.dayNum}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {untimed.length > 0 && (
            <div className="flex border-b border-[var(--panel-border)]">
              <div className="flex w-14 shrink-0 items-center justify-end pr-2">
                <span className="eyebrow">No time</span>
              </div>
              <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((d) => (
                  <div key={d.date} className="space-y-1 border-l border-[var(--panel-border)] p-1">
                    {untimed.filter((a) => a.date === d.date).map((a) => (
                      <Block key={a.id} a={a} compact />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* The top padding gives the first hour label room to sit on its line
            like the rest, instead of being nudged down to avoid clipping. */}
        <div className="flex pt-2">
          {/* Hour gutter */}
          <div className="w-14 shrink-0" style={{ height }}>
            {hours.map((h) => (
              <div key={h} className="relative" style={{ height: HOUR_PX }}>
                {/* Every label sits on its own hour line, the first included. */}
                <span
                  className="absolute -top-2 right-2 text-[0.62rem] font-semibold tabular-nums text-muted-foreground"
                >
                  {fmtHour(h)}
                </span>
              </div>
            ))}
          </div>

          <div
            className="grid flex-1"
            style={{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              height,
              // One hairline per hour, drawn as a background so the columns stay cheap.
              backgroundImage: `repeating-linear-gradient(to bottom, var(--panel-border) 0 1px, transparent 1px ${HOUR_PX}px)`,
            }}
          >
            {days.map((d) => {
              const placed = layoutDay(timed.filter((a) => a.date === d.date));
              return (
                <div key={d.date} className={cn("relative border-l border-[var(--panel-border)]", d.isToday && "bg-primary/[0.04]")}>
                  {placed.map((a) => {
                    const blockTop = top(a.startMin);
                    const blockHeight = (Math.max(a.duration, MIN_BLOCK_MIN) / 60) * HOUR_PX;
                    return (
                      <div
                        key={a.id}
                        className="absolute px-0.5"
                        style={{
                          top: blockTop,
                          height: blockHeight,
                          left: `${(a.col / a.cols) * 100}%`,
                          width: `${(1 / a.cols) * 100}%`,
                        }}
                      >
                        <Block a={a} dense={view === "week" || blockHeight < 44} />
                      </div>
                    );
                  })}

                  {/* Now line */}
                  {d.isToday && nowMin != null && nowMin >= startHour * 60 && nowMin <= endHour * 60 ? (
                    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: top(nowMin) }} aria-hidden>
                      <div className="relative h-px bg-rose-500">
                        <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-rose-500" />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {timed.length + untimed.length === 0 && (
        <p className="border-t border-[var(--panel-border)] py-6 text-center text-sm text-muted-foreground">
          Nothing scheduled {view === "day" ? "on this day" : "this week"}.
        </p>
      )}
    </Card>
  );
}

/** One appointment on the time grid. */
function Block({ a, dense = false, compact = false }) {
  return (
    <Link
      href={a.leadId ? `/leads/${a.leadId}` : "/appointments"}
      title={`${a.time} ${a.ampm} · ${a.co} · ${a.detail}`}
      className={cn(
        "flex h-full min-w-0 gap-1.5 overflow-hidden rounded-md border border-[var(--panel-border)] bg-card/90 px-1.5 py-1 transition-colors hover:border-primary/50 hover:bg-card",
        compact && "h-auto"
      )}
    >
      <span className={cn("w-[3px] shrink-0 rounded-full", a.bar)} />
      {dense ? (
        // A half-hour block is only ~28px tall, so everything goes on one line.
        <span className="min-w-0 flex-1 truncate text-[0.68rem] leading-tight">
          <span className="font-bold tabular-nums text-muted-foreground">{a.time}</span>{" "}
          <span className="font-medium">{a.co}</span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[0.66rem] font-bold tabular-nums text-muted-foreground">
            {a.time} {a.ampm}
          </span>
          <span className="block truncate text-xs font-medium">{a.co}</span>
          {!compact ? (
            <span className="block truncate text-[0.66rem] text-muted-foreground">{a.detail}</span>
          ) : null}
        </span>
      )}
      {!dense && !compact ? (
        <span
          className="flex size-6 shrink-0 items-center justify-center self-start rounded text-[0.55rem] font-bold text-white"
          style={{ background: a.repC }}
          title={a.rep}
        >
          {a.repI}
        </span>
      ) : null}
    </Link>
  );
}

/* --------------------------------------------------------------------------
   Month: heat-mapped grid with a side panel for the selected day.
   -------------------------------------------------------------------------- */
function MonthView({ year, month, rows, byDay, count, todayDay, title, dayHrefBase }) {
  const [selected, setSelected] = useState(todayDay);

  const START = new Date(year, month, 1).getDay();
  const DAYS = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < START; i++) cells.push(null);
  for (let d = 1; d <= DAYS; d++) cells.push(d);

  const busiest = Math.max(1, ...Object.values(byDay ?? {}));
  const dayOf = (a) => Number(String(a.date).slice(8, 10));
  const label = (d) =>
    new Date(year, month, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const isoOf = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

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
        <SectionHeader label={title} icon={CalendarRange} />
        <div className="p-4">
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {DOW.map((d) => (
              <div key={d} className="pb-2 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">{d}</div>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={i} className="min-h-[4.25rem] rounded-lg border border-transparent" />;
              const n = byDay?.[d] ?? 0;
              const isToday = d === todayDay;
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
          label={selected ? (selected === todayDay ? "Today" : label(selected)) : "This Month"}
          icon={CalendarClock}
          action={
            <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">
              {selected ? `${dayRows.length} appointment${dayRows.length === 1 ? "" : "s"}` : `${count} total`}
            </span>
          }
        />
        <div className="max-h-[34rem] space-y-1 overflow-y-auto p-4">
          {selected ? (
            <>
              {dayRows.map((a) => <ApptRow key={a.id} a={a} />)}
              {dayRows.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing scheduled {selected === todayDay ? "today" : `on ${label(selected)}`}.
                </p>
              )}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary"
                >
                  Show whole month
                </button>
                <Link
                  href={`${dayHrefBase}${isoOf(selected)}`}
                  scroll={false}
                  className="flex items-center gap-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary transition-opacity hover:opacity-75"
                >
                  Day view <ArrowRight className="size-3" />
                </Link>
              </div>
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
