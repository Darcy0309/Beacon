"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MONTHS, formatIso, monthStart, sameMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * A calendar's month, as a button that opens the months of its year (Sean,
 * Oct 2026: going to November took him a while with only the arrows): a year
 * back or on with the arrows either side, a month picked goes there, and This
 * month comes back. `month` "YYYY-MM-DD" (any day of it); `onPick` is given
 * the first of the month picked.
 */
export default function MonthJump({ month, today, onPick, className, label = null }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const go = (iso) => { setOpen(false); onPick(iso); };
  const step = "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setYear(Number(month.slice(0, 4))); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${formatIso(month, "month")}, go to another month`} data-month-jump
          className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition-colors hover:bg-muted hover:text-primary", className)}>
          {label ?? formatIso(month, "month")}
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64 p-3" data-month-jump-menu>
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className={step} onClick={() => setYear((y) => y - 1)} aria-label="Previous year"><ChevronLeft className="size-4" /></button>
          <span className="text-sm font-semibold tabular-nums" data-month-jump-year>{year}</span>
          <button type="button" className={step} onClick={() => setYear((y) => y + 1)} aria-label="Next year"><ChevronRight className="size-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={`Months of ${year}`}>
          {MONTHS.map((name, i) => {
            const first = `${year}-${String(i + 1).padStart(2, "0")}-01`;
            const current = sameMonth(first, month);
            return (
              <button key={name} type="button" onClick={() => go(first)} aria-pressed={current} data-month-pick={first.slice(0, 7)}
                className={cn("rounded-lg py-2 text-sm transition-colors",
                  current ? "bg-primary text-primary-foreground" : today && sameMonth(first, today) ? "text-primary ring-1 ring-primary/50 hover:bg-muted" : "hover:bg-muted")}>
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>
        {today && !sameMonth(today, month) ? (
          <button type="button" onClick={() => go(monthStart(today))} className="mt-2 w-full rounded-lg py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary hover:bg-muted">
            This month
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
