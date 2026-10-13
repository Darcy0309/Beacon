"use client";

import { useState } from "react";
import { ArrowRight, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/shared/intent-link";
import { addMonths, formatIso, monthGrid, monthStart, sameMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * A calendar in a tile: a client's (every one of its projects' appointments
 * together) or one project's. A month at a glance, the days with
 * appointments filled in and counted; a day opens it on the full calendar,
 * kept to this client or project.
 *
 *   days    { "2026-10-14": 2 }, for the months from `first` to `last`
 *   blocked { "2026-10-22": "day" | "part" }: days with time blocked out
 *   query   "client=5" or "project=12", for the links to the full calendar
 *   compact as tall as the stat tiles beside it: shorter weeks, the month beside the heading
 */
export default function CalendarTile({ label, note, days, blocked = {}, today, first, last, query, accent = "var(--neon-amber)", compact = false, className, style }) {
  const [month, setMonth] = useState(monthStart(today));
  const grid = monthGrid(month);
  const inMonth = Object.entries(days).filter(([d]) => sameMonth(d, month)).reduce((sum, [, c]) => sum + c, 0);
  const canPrev = month > monthStart(first);
  const canNext = month < monthStart(last);
  const step = "flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

  return (
    <div data-panel data-accent-edge="" data-calendar-tile
      className={cn("group relative flex flex-col overflow-hidden rounded-xl transition-colors duration-200", className)}
      style={{ "--edge": accent, ...style }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${accent} 16%, transparent), transparent 62%)` }} />
      <div className="relative flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border"
            style={{ borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`, background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
            <CalendarRange className="size-4" />
          </span>
          <span className="stat-label min-w-0 flex-1 pt-0.5" style={{ color: `color-mix(in srgb, ${accent} 68%, var(--foreground))` }}>{label}</span>
          <Link href={`/calendar?${query}&view=month&d=${month}`} className="mt-1 flex shrink-0 items-center gap-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-primary hover:underline" data-open-calendar>
            Open <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className={cn("flex items-center justify-between", compact ? "mt-1" : "mt-2")}>
          <button type="button" className={step} disabled={!canPrev} onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft className="size-3.5" /></button>
          <span className="text-xs font-semibold" data-tile-month>
            {formatIso(month, "month")}
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{inMonth} appt{inMonth === 1 ? "" : "s"}</span>
          </span>
          <button type="button" className={step} disabled={!canNext} onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight className="size-3.5" /></button>
        </div>

        <div className="mt-1 grid grid-cols-7 gap-px text-center" aria-hidden>
          {DOW.map((d, i) => <div key={i} className="text-[0.55rem] font-bold uppercase text-muted-foreground">{d}</div>)}
        </div>
        <div className={cn("grid flex-1 grid-cols-7 gap-px text-center", compact ? "[grid-auto-rows:minmax(1.05rem,1fr)]" : "[grid-auto-rows:minmax(1.25rem,1fr)]")} role="grid" aria-label={formatIso(month, "month")}>
          {grid.map((day) => {
            const count = days[day] ?? 0;
            const dim = !sameMonth(day, month);
            return (
              <Link key={day} href={`/calendar?${query}&view=day&d=${day}`} prefetch={false} data-tile-day={day} data-count={count || undefined} data-blocked={blocked[day] || undefined}
                title={`${formatIso(day, "long")}: ${count ? `${count} appointment${count === 1 ? "" : "s"}` : "no appointments"}${blocked[day] ? (blocked[day] === "day" ? ", blocked out" : ", partly blocked out") : ""}`}
                // Blocked out: shaded for the whole day, underlined for part of it.
                style={blocked[day] && !dim ? (blocked[day] === "day"
                  ? { backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--neon-amber) 35%, transparent) 0 2px, transparent 2px 5px)" }
                  : { boxShadow: "inset 0 -2px 0 var(--neon-amber)" }) : undefined}
                className={cn(
                  "relative flex items-center justify-center rounded text-[0.65rem] tabular-nums transition-colors hover:bg-muted",
                  dim && "text-muted-foreground/40",
                  count && !dim && "bg-primary/20 font-bold text-primary hover:bg-primary/30",
                  day === today && "ring-1 ring-primary"
                )}>
                {Number(day.slice(8))}
                {count > 1 && !dim ? <sup className="absolute right-0.5 top-0 text-[0.45rem] leading-none">{count}</sup> : null}
              </Link>
            );
          })}
        </div>
        {note ? <p className="pt-2 text-[0.62rem] leading-tight text-muted-foreground">{note}</p> : null}
      </div>
    </div>
  );
}
