"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  MONTHS, WEEKDAYS, addDays, addMonths, addYears, clampIso, formatIso, monthEnd, monthGrid, monthStart,
  sameMonth, todayIso, weekdayOf,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

const navButton =
  "flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

/**
 * A month calendar for picking a day or a range.
 *
 *   value          the chosen day ("YYYY-MM-DD"), or
 *   range          { from, to } with `hover` previewing the end of a range
 *   month          any day of the month on show; onMonthChange(iso) moves it
 *   onSelect(iso)  a day chosen by click, Enter or Space
 *   min, max       the first and last days that can be chosen
 *   marks          { iso: count }, drawn as dots under the day (appointments)
 *   months         how many months side by side
 *
 * The title opens a month list, and from there a year list, so a date far
 * off is three clicks away. Keyboard: arrows move a day or a week, Page Up
 * and Page Down a month (with Shift, a year), Home and End the week's ends.
 */
export default function Calendar({
  value, range, hover, onHover, month, onMonthChange, onSelect, min, max,
  marks, markLabel = (n) => `${n} appointment${n === 1 ? "" : "s"}`, months = 1, autoFocus = false,
}) {
  const today = todayIso();
  const [view, setView] = useState("days");
  const [focusIso, setFocusIso] = useState(() => clampIso(value ?? range?.from ?? (sameMonth(today, month) ? today : monthStart(month)), min, max));
  const gridRef = useRef(null);
  const moved = useRef(autoFocus);

  // A new month from outside (a preset, a typed date) brings the focus along.
  const shown = Array.from({ length: months }, (_, i) => addMonths(monthStart(month), i));
  const inView = (iso) => shown.some((m) => sameMonth(m, iso));
  useEffect(() => {
    if (!inView(focusIso)) setFocusIso(clampIso(sameMonth(today, month) ? today : monthStart(month), min, max));
  }, [month]);

  // After a key moved the focus, put it on that day's button.
  useEffect(() => {
    if (view !== "days" || !moved.current) return;
    moved.current = false;
    gridRef.current?.querySelector(`[data-iso="${focusIso}"]`)?.focus();
  }, [focusIso, view]);

  const allowed = (iso) => (!min || iso >= min) && (!max || iso <= max);

  const moveFocus = (iso) => {
    const next = clampIso(iso, min, max);
    moved.current = true;
    setFocusIso(next);
    onHover?.(next);
    if (!inView(next)) onMonthChange(next < shown[0] ? monthStart(next) : addMonths(monthStart(next), 1 - months));
  };

  const onKeyDown = (e) => {
    const keys = {
      ArrowLeft: () => addDays(focusIso, -1),
      ArrowRight: () => addDays(focusIso, 1),
      ArrowUp: () => addDays(focusIso, -7),
      ArrowDown: () => addDays(focusIso, 7),
      PageUp: () => (e.shiftKey ? addYears(focusIso, -1) : addMonths(focusIso, -1)),
      PageDown: () => (e.shiftKey ? addYears(focusIso, 1) : addMonths(focusIso, 1)),
      Home: () => addDays(focusIso, -weekdayOf(focusIso)),
      End: () => addDays(focusIso, 6 - weekdayOf(focusIso)),
    };
    if (keys[e.key]) {
      e.preventDefault();
      moveFocus(keys[e.key]());
    } else if ((e.key === "Enter" || e.key === " ") && allowed(focusIso)) {
      e.preventDefault();
      onSelect(focusIso);
    }
  };

  const year = Number(month.slice(0, 4));

  if (view === "months") {
    return (
      <div className="w-72" role="group" aria-label={`Months of ${year}`}>
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className={navButton} onClick={() => onMonthChange(addYears(month, -1))} aria-label="Previous year"><ChevronLeft className="size-4" /></button>
          <button type="button" onClick={() => setView("years")} className="cursor-pointer rounded-lg px-3 py-1 text-sm font-semibold transition-colors hover:bg-muted">{year}</button>
          <button type="button" className={navButton} onClick={() => onMonthChange(addYears(month, 1))} aria-label="Next year"><ChevronRight className="size-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((name, i) => {
            const first = `${year}-${String(i + 1).padStart(2, "0")}-01`;
            const disabled = (max && first > max) || (min && monthEnd(first) < min);
            const current = sameMonth(first, month);
            return (
              <button
                key={name}
                type="button"
                disabled={disabled}
                onClick={() => { onMonthChange(clampIso(first, min ? monthStart(min) : null, max)); setView("days"); }}
                className={cn(
                  "cursor-pointer rounded-lg py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                  current ? "bg-primary text-primary-foreground" : sameMonth(first, today) ? "text-primary ring-1 ring-primary/50 hover:bg-muted" : "hover:bg-muted"
                )}
              >
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === "years") {
    const first = year - (year % 12);
    return (
      <div className="w-72" role="group" aria-label="Years">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className={navButton} onClick={() => onMonthChange(addYears(month, -12))} aria-label="Earlier years"><ChevronLeft className="size-4" /></button>
          <span className="text-sm font-semibold">{first} – {first + 11}</span>
          <button type="button" className={navButton} onClick={() => onMonthChange(addYears(month, 12))} aria-label="Later years"><ChevronRight className="size-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => first + i).map((y) => {
            const disabled = (max && `${y}-01-01` > max) || (min && `${y}-12-31` < min);
            return (
              <button
                key={y}
                type="button"
                disabled={disabled}
                onClick={() => { onMonthChange(`${y}${monthStart(month).slice(4)}`); setView("months"); }}
                className={cn(
                  "cursor-pointer rounded-lg py-2.5 text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                  y === year ? "bg-primary text-primary-foreground" : y === Number(today.slice(0, 4)) ? "text-primary ring-1 ring-primary/50 hover:bg-muted" : "hover:bg-muted"
                )}
              >
                {y}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const [rangeFrom, rangeTo] = range
    ? [range.from, range.to ?? (hover && range.from && hover >= range.from ? hover : null)]
    : [null, null];

  return (
    <div ref={gridRef} className="flex flex-col gap-4 sm:flex-row" onKeyDown={onKeyDown}>
      {shown.map((m, mi) => (
        <div key={m} className="w-[17.5rem]">
          <div className="mb-2 flex items-center justify-between">
            {mi === 0 ? (
              <button type="button" className={navButton} onClick={() => onMonthChange(addMonths(month, -1))}
                disabled={Boolean(min) && monthStart(min) >= monthStart(m)} aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </button>
            ) : <span className="size-8" />}
            <button type="button" onClick={() => setView("months")} aria-label={`${formatIso(m, "month")}, choose a month`}
              className="cursor-pointer rounded-lg px-3 py-1 text-sm font-semibold transition-colors hover:bg-muted" id={`cal-${m}`}>
              {formatIso(m, "month")}
            </button>
            {mi === shown.length - 1 ? (
              <button type="button" className={navButton} onClick={() => onMonthChange(addMonths(month, 1))}
                disabled={Boolean(max) && monthStart(max) <= monthStart(m)} aria-label="Next month">
                <ChevronRight className="size-4" />
              </button>
            ) : <span className="size-8" />}
          </div>

          <div role="grid" aria-labelledby={`cal-${m}`} className="select-none">
            <div role="row" className="mb-1 grid grid-cols-7">
              {WEEKDAYS.map((d) => (
                <span key={d} role="columnheader" aria-label={d} className="py-1 text-center text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {d.slice(0, 2)}
                </span>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, w) => (
              <div key={w} role="row" className="grid grid-cols-7">
                {monthGrid(m).slice(w * 7, w * 7 + 7).map((iso) => {
                  const outside = !sameMonth(iso, m);
                  // Side by side, the neighbouring month shows those days itself: leave them blank here.
                  if (outside && months > 1) return <div key={iso} role="gridcell" aria-hidden className="py-0.5"><span className="block size-9" /></div>;
                  const disabled = !allowed(iso);
                  const isToday = iso === today;
                  const count = Number(marks?.[iso] ?? 0);
                  const isStart = rangeFrom === iso;
                  const isEnd = rangeTo === iso;
                  const inRange = Boolean(rangeFrom && rangeTo && iso > rangeFrom && iso < rangeTo);
                  const selected = range ? isStart || isEnd : value === iso;
                  const label = [formatIso(iso, "full"), isToday ? "today" : null, count ? markLabel(count) : null, disabled ? "not available" : null]
                    .filter(Boolean).join(", ");
                  return (
                    <div key={iso} role="gridcell" aria-selected={selected || inRange} className="relative flex justify-center py-0.5">
                      {/* The band behind a range: from the start's middle to the end's middle. */}
                      {!outside && (inRange || (isStart && rangeTo && rangeTo !== iso) || (isEnd && rangeFrom && rangeFrom !== iso)) ? (
                        <span aria-hidden className={cn("absolute inset-y-0.5 bg-primary/12", isStart ? "left-1/2 right-0" : isEnd ? "left-0 right-1/2" : "inset-x-0")} />
                      ) : null}
                      <button
                        type="button"
                        data-iso={iso}
                        tabIndex={iso === focusIso ? 0 : -1}
                        disabled={disabled}
                        aria-label={label}
                        aria-current={isToday ? "date" : undefined}
                        onClick={() => { setFocusIso(iso); onSelect(iso); }}
                        onMouseEnter={() => onHover?.(iso)}
                        onFocus={() => setFocusIso(iso)}
                        className={cn(
                          "relative z-10 flex size-9 cursor-pointer flex-col items-center justify-center rounded-lg text-sm tabular-nums outline-none transition-colors",
                          "focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-30",
                          selected
                            ? "bg-primary font-semibold text-primary-foreground shadow-[0_0_14px_-4px_var(--primary)]"
                            : inRange
                              ? "text-foreground hover:bg-primary/20"
                              : outside
                                ? "text-muted-foreground/45 hover:bg-muted"
                                : "hover:bg-muted",
                          isToday && !selected && "font-semibold text-primary ring-1 ring-inset ring-primary/50"
                        )}
                      >
                        <span className="leading-none">{Number(iso.slice(8))}</span>
                        {count ? (
                          <span aria-hidden className="absolute bottom-1 flex gap-0.5" title={markLabel(count)}>
                            {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                              <span key={i} className={cn("size-1 rounded-full", selected ? "bg-primary-foreground" : count >= 4 ? "bg-amber-500" : "bg-emerald-500")} />
                            ))}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
