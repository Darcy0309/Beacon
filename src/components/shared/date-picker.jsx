"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import Calendar from "@/components/shared/calendar";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  addDays, addMonths, addYears, formatIso, monthGrid, monthStart, parseTypedDate, relativeDay, todayIso,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import { blockHours, dayMarks as calendarDayMarks, eventsOn } from "@/lib/project-calendar";

/** Quick picks offered under the calendar, by name. */
const PRESETS = {
  today: ["Today", (t) => t],
  tomorrow: ["Tomorrow", (t) => addDays(t, 1)],
  nextMonday: ["Next Monday", (t) => parseTypedDate("next mon", { today: t })],
  nextWeek: ["In a week", (t) => addDays(t, 7)],
  nextMonth: ["In a month", (t) => addMonths(t, 1)],
  nextYear: ["In a year", (t) => addYears(t, 1)],
};

// A project's calendar for the visible month (appointments and blocked time), kept a minute too.
// False when it could not be read, so the picker says so instead of "Reading…" for ever (Oct 2026).
const projectCache = new Map();
async function projectMonth(projectId, month) {
  const key = `${projectId}:${month}`;
  const hit = projectCache.get(key);
  if (hit && Date.now() - hit.at < MARK_TTL_MS) return hit.data;
  const grid = monthGrid(month);
  try {
    const res = await fetch(`/api/project-calendar?project=${projectId}&from=${grid[0]}&to=${grid[41]}`);
    if (!res.ok) return false;
    const data = await res.json();
    projectCache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return false;
  }
}

// Appointment counts per visible month, kept a minute so paging back and forth is free.
const markCache = new Map();
const MARK_TTL_MS = 60_000;

async function appointmentMarks(month) {
  const hit = markCache.get(month);
  if (hit && Date.now() - hit.at < MARK_TTL_MS) return hit.days;
  const grid = monthGrid(month);
  try {
    const res = await fetch(`/api/appointments/days?from=${grid[0]}&to=${grid[41]}`);
    const { days = {} } = await res.json();
    markCache.set(month, { at: Date.now(), days });
    return days;
  } catch {
    // The dots are a hint: none, then.
    return {};
  }
}

/**
 * A date field: type it ("10/15", "Oct 15", "next fri", "+2w", "tomorrow")
 * or pick it from the calendar (click the field or the icon, or press the
 * down arrow). Shows the date in words with how far off it is, and submits
 * "YYYY-MM-DD" in a hidden input called `name`, as a native date input
 * would, so forms and their validation need nothing else.
 *
 *   min, max   first and last days allowed ("today" means the viewer's today)
 *   presets    quick picks by name: today, tomorrow, nextMonday, nextWeek,
 *              nextMonth, nextYear
 *   marks      "appointments" puts a dot on days that already have some
 *   calendarProject  a project's calendar (its id) to pick on: its booked days
 *              dotted, its blocked time shaded, and what a day holds said
 *              under the calendar as it is pointed at or chosen
 *   future     a typed date with no year means the next one ("Jan 5" in December)
 *   value/onChange to control it; defaultValue otherwise
 */
export default function DatePicker({
  name, value: controlled, defaultValue = "", onChange, min, max, required, invalid, disabled, id,
  "aria-label": ariaLabel = "Date", placeholder = "Type or pick a date", presets = [], marks, future = false, calendarProject = null, className,
}) {
  const today = todayIso();
  const lo = min === "today" ? today : min || null;
  const hi = max === "today" ? today : max || null;
  const isControlled = controlled !== undefined;
  const [own, setOwn] = useState(defaultValue || "");
  const value = (isControlled ? controlled : own) || "";

  const [text, setText] = useState(value ? formatIso(value) : "");
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(value || lo || today));
  const [dayMarks, setDayMarks] = useState({});
  const [projectData, setProjectData] = useState(null);
  const [hoverDay, setHoverDay] = useState(null);
  const inputRef = useRef(null);
  const fieldRef = useRef(null);
  const contentRef = useRef(null);
  const refocusInput = useRef(false);
  const hintId = useId();
  // "in 3 days" depends on the viewer's clock: drawn in the browser only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Shown in words whenever nobody is typing in it.
  useEffect(() => {
    if (!editing) setText(value ? formatIso(value) : "");
  }, [value, editing]);

  useEffect(() => {
    if (!open || marks !== "appointments") return;
    let live = true;
    appointmentMarks(month).then((days) => live && setDayMarks(days));
    return () => {
      live = false;
    };
  }, [open, month, marks]);

  useEffect(() => {
    if (!open || !calendarProject) return;
    let live = true;
    projectMonth(calendarProject, month).then((data) => live && setProjectData(data));
    return () => {
      live = false;
    };
  }, [open, month, calendarProject]);
  // The project's month as the calendar draws it: dots for appointments, shading for blocked time.
  const grid = monthGrid(month);
  const projectMarks = projectData ? calendarDayMarks(projectData, grid[0], grid[41]) : null;
  const shownMarks = projectMarks
    ? Object.fromEntries(Object.entries(projectMarks).filter(([, m]) => m.appointments).map(([d, m]) => [d, m.appointments]))
    : marks === "appointments" ? dayMarks : undefined;
  const shownBlocked = projectMarks
    ? Object.fromEntries(Object.entries(projectMarks).filter(([, m]) => m.blocked).map(([d, m]) => [d, m.blocked]))
    : undefined;
  // What the day pointed at (else the one chosen) holds on the project's calendar.
  const shownDay = hoverDay ?? value;
  const dayEvents = projectData && shownDay ? eventsOn(shownDay, projectData) : [];

  const set = (iso) => {
    setProblem(null);
    if (!isControlled) setOwn(iso);
    onChange?.(iso);
    setText(iso ? formatIso(iso) : "");
    if (iso) setMonth(monthStart(iso));
  };

  /** Read what was typed. True when it made a date (or was cleared). */
  const read = () => {
    const typed = text.trim();
    if (!typed || typed === formatIso(value)) {
      if (!typed) set("");
      return true;
    }
    const iso = parseTypedDate(typed, { future });
    const reason = !iso ? "unreadable" : lo && iso < lo ? "early" : hi && iso > hi ? "late" : null;
    if (reason) {
      setProblem(reason);
      if (!isControlled) setOwn("");
      onChange?.("");
      return false;
    }
    set(iso);
    return true;
  };

  const focusDay = () => requestAnimationFrame(() => contentRef.current?.querySelector('[data-iso][tabindex="0"]')?.focus());

  const choose = (iso) => {
    set(iso);
    refocusInput.current = true;
    setOpen(false);
  };

  const quick = presets
    .map((key) => PRESETS[key] && [PRESETS[key][0], PRESETS[key][1](today)])
    .filter((p) => p && p[1]);

  const message = {
    unreadable: "Couldn't read that date. Try 10/15/2026, Oct 15 or next fri.",
    early: `Choose ${lo === today ? "today or later" : `${formatIso(lo, "medium")} or later`}.`,
    late: `Choose ${formatIso(hi, "medium")} or earlier.`,
  }[problem];

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          // Open on the chosen day's month, or this month when nothing is chosen yet.
          if (o) setMonth(monthStart(value || lo || today));
          setOpen(o);
        }}
      >
        <PopoverAnchor asChild>
          <div
            ref={fieldRef}
            className={cn(
              "@container flex h-9 w-full items-center rounded-md border border-input bg-background/60 text-sm transition-colors",
              "focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring/30",
              (invalid || problem) && "border-destructive focus-within:ring-destructive/30",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                onClick={() => !open && focusDay()}
                aria-label={value ? `Change date, ${formatIso(value, "full")}` : "Choose a date"}
                className="flex h-full shrink-0 cursor-pointer items-center pl-3 pr-2 text-muted-foreground transition-colors hover:text-primary"
              >
                <CalendarDays className="size-4" />
              </button>
            </PopoverTrigger>
            <input
              ref={inputRef}
              id={id}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={text}
              placeholder={placeholder}
              disabled={disabled}
              aria-label={ariaLabel}
              title={value && mounted ? `${formatIso(value, "full")} · ${relativeDay(value, today)}` : undefined}
              aria-invalid={Boolean(invalid || problem)}
              aria-describedby={hintId}
              aria-haspopup="dialog"
              aria-expanded={open}
              onFocus={(e) => {
                setEditing(true);
                e.target.select();
              }}
              onBlur={() => {
                setEditing(false);
                read();
              }}
              onChange={(e) => {
                setText(e.target.value);
                setEditing(true);
                setProblem(null);
              }}
              onClick={() => {
                if (open) return;
                setMonth(monthStart(value || lo || today));
                setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // Never submit the form from here; read the date instead.
                  e.preventDefault();
                  if (read()) {
                    // Read: show it in words with how far off it is, even with the cursor still here.
                    setEditing(false);
                    setOpen(false);
                  }
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  read();
                  setOpen(true);
                  focusDay();
                }
              }}
              className="h-full min-w-0 flex-1 bg-transparent pr-2 outline-none placeholder:text-muted-foreground"
            />
            {/* Only where the date itself still fits; it is in the field's tooltip either way. */}
            {value && !editing && mounted ? (
              <span data-relative className="pointer-events-none hidden shrink-0 pr-2 text-xs text-muted-foreground @min-[20rem]:inline">{relativeDay(value, today)}</span>
            ) : null}
            {value && !disabled ? (
              <button
                type="button"
                onClick={() => {
                  set("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear the date"
                className="mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
            <input type="hidden" name={name} value={value} />
          </div>
        </PopoverAnchor>

        <PopoverContent
          ref={contentRef}
          aria-label="Calendar"
          // The field keeps the caret when it opened the calendar; a key or the icon moves focus in.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (refocusInput.current) inputRef.current?.focus({ preventScroll: true });
            refocusInput.current = false;
          }}
          onEscapeKeyDown={() => {
            refocusInput.current = true;
          }}
          // Typing in the field, or clicking it, is not "outside".
          onInteractOutside={(e) => {
            if (fieldRef.current?.contains(e.target)) e.preventDefault();
          }}
        >
          <Calendar
            value={value || null}
            month={month}
            onMonthChange={setMonth}
            onSelect={choose}
            min={lo}
            max={hi}
            marks={shownMarks}
            blocked={shownBlocked}
            onHover={calendarProject ? setHoverDay : undefined}
          />
          {calendarProject ? (
            // The project's calendar for the day pointed at: booked times and blocked time, before choosing.
            <div className="mt-2 max-w-[17rem] border-t border-[var(--panel-border)] pt-2 text-[0.7rem]" data-picker-day onMouseLeave={() => setHoverDay(null)}>
              {projectData === false ? (
                <div className="font-medium text-destructive" data-picker-unread>Couldn&apos;t read the project&apos;s calendar. Close the calendar and open it again to retry.</div>
              ) : shownDay ? (
                <>
                  <div className="font-semibold">{formatIso(shownDay, "medium")}</div>
                  {dayEvents.length ? dayEvents.map((e) => (
                    <div key={e.key} className="truncate" style={e.kind === "block" ? { color: "var(--neon-amber)" } : undefined}>
                      {e.kind === "block"
                        ? `${e.block.synced ? "Busy" : "Blocked"} · ${blockHours(e.block)}${e.block.note ? ` · ${e.block.note}` : ""}`
                        : `${e.appointment.time ?? "No time"} · ${e.appointment.company ?? "Appointment"}`}
                    </div>
                  )) : <div className="text-muted-foreground">{projectData ? "Nothing booked or blocked." : "Reading the project's calendar…"}</div>}
                </>
              ) : <div className="text-muted-foreground">Point at a day to see what the project&apos;s calendar has on it.</div>}
            </div>
          ) : null}
          {quick.length || (value && !required) ? (
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[var(--panel-border)] pt-2">
              {quick.map(([label, iso]) => {
                const off = (lo && iso < lo) || (hi && iso > hi);
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={off}
                    onClick={() => choose(iso)}
                    title={formatIso(iso, "full")}
                    className={cn(
                      "cursor-pointer rounded-full border px-2 py-0.5 text-[0.7rem] transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                      iso === value ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
              {value && !required ? (
                <button type="button" onClick={() => choose("")} className="ml-auto cursor-pointer text-xs text-muted-foreground transition-colors hover:text-destructive">
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
          {marks === "appointments" || calendarProject ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-[0.66rem] text-muted-foreground">
              <span className="size-1 rounded-full bg-emerald-500" /> already booked
              <span className="ml-1 size-1 rounded-full bg-amber-500" /> 4 or more
              {calendarProject ? <><span className="ml-1 inline-block h-2 w-3 rounded-sm" style={{ backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--neon-amber) 45%, transparent) 0 2px, transparent 2px 4px)" }} /> blocked</> : null}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
      <p id={hintId} className={cn("text-[0.7rem]", message ? "font-medium text-destructive" : "sr-only")} role={message ? "alert" : undefined}>
        {message ?? "Type a date such as 10/15, Oct 15 or next fri, or press the down arrow to pick one."}
      </p>
    </div>
  );
}
