"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import Calendar from "@/components/shared/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, addMonths, daysBetween, formatRange, monthStart, todayIso, weekdayOf } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Ranges one click away, worked out from today. Weeks start on Monday. */
const QUICK = [
  ["Today", (t) => [t, t]],
  ["Yesterday", (t) => [addDays(t, -1), addDays(t, -1)]],
  ["This week", (t) => [addDays(t, -((weekdayOf(t) + 6) % 7)), t]],
  ["Last 7 days", (t) => [addDays(t, -6), t]],
  ["Last 30 days", (t) => [addDays(t, -29), t]],
  ["This month", (t) => [monthStart(t), t]],
  ["Last month", (t) => [monthStart(addMonths(t, -1)), addDays(monthStart(t), -1)]],
  ["This year", (t) => [`${t.slice(0, 4)}-01-01`, t]],
];

/**
 * Pick a span of days: two months side by side (one on a phone), click the
 * first day and the last, or take a quick range from the list. Apply puts
 * the days in hidden inputs (`fromName`, `toName`) and submits the form the
 * picker sits in, so a GET report form needs nothing else.
 *
 *   maxDays   the longest span allowed
 *   max       the last day that can be chosen ("today" for the viewer's today)
 *   active    draws the trigger as the current choice
 */
export default function DateRangePicker({
  fromName = "from", toName = "to", defaultFrom, defaultTo, max, maxDays = 366, active = false, className,
}) {
  const today = todayIso();
  const hi = max === "today" ? today : max || null;
  const [range, setRange] = useState({ from: defaultFrom ?? null, to: defaultTo ?? null });
  const [draft, setDraft] = useState(range);
  const [hover, setHover] = useState(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(addMonths(defaultTo ?? today, -1)));
  const [wide, setWide] = useState(true);
  const hiddenFrom = useRef(null);

  // Two months where there is room for them.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const reopen = (o) => {
    setOpen(o);
    if (o) {
      setDraft(range);
      setHover(null);
      setMonth(monthStart(wide ? addMonths(range.to ?? today, -1) : range.to ?? today));
    }
  };

  // First click starts a range, the second ends it (in either order).
  const pick = (iso) => {
    if (!draft.from || draft.to) setDraft({ from: iso, to: null });
    else setDraft(iso < draft.from ? { from: iso, to: draft.from } : { from: draft.from, to: iso });
  };

  const span = draft.from && draft.to ? daysBetween(draft.from, draft.to) + 1 : 0;
  const tooLong = span > maxDays;

  const apply = (from, to) => {
    setRange({ from, to });
    setOpen(false);
    // Hidden inputs take the new values on the next render; submit after it.
    requestAnimationFrame(() => hiddenFrom.current?.form?.requestSubmit());
  };

  return (
    <Popover open={open} onOpenChange={reopen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={range.from ? `Date range, ${formatRange(range.from, range.to)}. Change` : "Choose a date range"}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors",
            active ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary",
            className
          )}
        >
          <CalendarRange className="size-3.5" />
          <span className="tabular-nums">{range.from ? formatRange(range.from, range.to) : "Custom range"}</span>
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <input ref={hiddenFrom} type="hidden" name={fromName} value={range.from ?? ""} />
      <input type="hidden" name={toName} value={range.to ?? ""} />

      <PopoverContent className="w-auto max-w-[calc(100vw-1rem)]" aria-label="Choose a date range">
        <div className="flex flex-col gap-4 sm:flex-row">
          <ul className="flex flex-wrap gap-1.5 sm:w-32 sm:flex-col sm:gap-0.5 sm:border-r sm:border-[var(--panel-border)] sm:pr-3">
            {QUICK.map(([label, make]) => {
              const [from, to] = make(today);
              const current = draft.from === from && draft.to === to;
              return (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => apply(from, to)}
                    className={cn(
                      "w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                      current ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
          <div>
            <Calendar
              range={draft}
              hover={hover}
              onHover={setHover}
              month={month}
              onMonthChange={setMonth}
              onSelect={pick}
              max={hi}
              months={wide ? 2 : 1}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--panel-border)] pt-3">
              <span className={cn("text-xs tabular-nums", tooLong ? "font-medium text-destructive" : "text-muted-foreground")} aria-live="polite">
                {!draft.from
                  ? "Click the first day."
                  : !draft.to
                    ? "Now click the last day."
                    : tooLong
                      ? `${span} days: choose ${maxDays} or fewer.`
                      : `${formatRange(draft.from, draft.to)} · ${span} day${span === 1 ? "" : "s"}`}
              </span>
              <span className="ml-auto flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="button" size="sm" disabled={!draft.from || !draft.to || tooLong} onClick={() => apply(draft.from, draft.to)}>
                  Apply
                </Button>
              </span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
