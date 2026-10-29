"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { removeCalendarNote } from "@/features/calendar/actions";
import { reach } from "@/lib/reach";
import Link from "@/components/shared/intent-link";
import {
  CalendarRange, CalendarClock, ChevronLeft, ChevronRight, ArrowRight, Ban,
  Phone, ArrowUpRight, User, MapPin, Mail, FolderKanban, Clock, MessageSquareText, StickyNote, X } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import ToneBadge from "@/components/shared/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import TipLayer from "@/components/shared/tip-layer";
import MonthJump from "@/components/shared/month-jump";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { telHref } from "@/lib/format";
import LeadFiles from "@/features/leads/components/lead-files";
import { useRole } from "@/components/layout/role-provider";
import { blockDays, blockHours, blockOn, clockOf, noteTime } from "@/lib/project-calendar";
import { NoteDialog } from "@/features/calendar/components/project-calendar";
import RemoveBlock from "@/features/calendar/components/remove-block";
import { cn } from "@/lib/utils";

/** Lets any appointment in any of the three views open the shared dialog. */
const OpenAppointment = createContext(() => {});
/** The appointment a notification pointed at (?a=<id>): highlighted wherever it shows. */
const FocusedAppointment = createContext(null);

/** Is this the appointment the visitor came to see? It is scrolled into view, once. */
function useFocused(a) {
  const focused = useContext(FocusedAppointment) === a.id;
  const ref = useRef(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);
  return [focused, ref];
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Time-grid geometry. One hour is HOUR_PX tall; a block never renders shorter
// than MIN_BLOCK_MIN so a 15-minute call is still readable.
const HOUR_PX = 56;
const MIN_BLOCK_MIN = 30;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 19;
/** timeRank() yields 1441 for a time it cannot parse; those get their own strip. */
const UNTIMED = 24 * 60;

// Time blocked out on a project's calendar (calendar_blocks, and the client's days to avoid every week), as getProjectCalendar() shapes it.
const blocksDay = blockOn;
// Its note and who blocked it; a busy time from someone's own calendar says only whose.
const blockNote = (b) => (b.synced ? (b.by ? `${b.by}'s calendar` : "A connected calendar") : [b.note, b.by ? `by ${b.by}` : null].filter(Boolean).join(" · "));
// A note on a time of day ("Hour Text"): what it says, who wrote it, and on which calendar when several are shown.
const NOTED = "var(--neon-violet)";
const noteTitle = (n) => [noteTime(n), n.text, n.by ? `by ${n.by}` : null, n.project].filter(Boolean).join(" · ");
const blockTitle = (b) => [b.synced ? "Busy" : "Blocked", blockHours(b), blockNote(b), b.project].filter(Boolean).join(" · ");
const BLOCKED_FILL = {
  borderColor: "color-mix(in srgb, var(--neon-amber) 40%, transparent)",
  backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--neon-amber) 20%, transparent) 0 4px, color-mix(in srgb, var(--neon-amber) 6%, transparent) 4px 9px)",
};

/**
 * What a hover over an appointment shows (TipLayer): who, when, how it
 * stands, whom to call and for which client. A click opens the details.
 */
function appointmentTips(rows) {
  return Object.fromEntries(rows.map((a) => [String(a.id), {
    title: a.co,
    rows: [
      { key: "when", label: "When", value: `${a.time}${a.ampm ? ` ${a.ampm}` : ""} · ${a.duration} min` },
      { key: "status", label: "Status", value: a.status },
      a.contact ? { key: "contact", label: "Contact", value: [a.contact, a.contactTitle].filter(Boolean).join(", ") } : null,
      a.phone ? { key: "phone", label: "Phone", value: a.phone } : null,
      a.rep ? { key: "rep", label: "Rep", value: a.rep } : null,
      a.client ? { key: "client", label: "Client", value: a.client } : null,
    ].filter(Boolean),
    foot: "Click for details",
  }]));
}

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
  const { view, title, prev, next, todayHref, viewHrefs, focusId = null, monthHrefBase, today, year, month } = props;
  const [selected, setSelected] = useState(null);
  const router = useRouter();
  const shownMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;

  return (
    <OpenAppointment.Provider value={setSelected}>
    <FocusedAppointment.Provider value={focusId}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="surface-chip flex items-center gap-1 rounded-lg border border-[var(--panel-border)] p-1">
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
          {/* Straight to another month or year (Sean, Oct 2026), not only a step at a time. */}
          {monthHrefBase ? (
            <MonthJump month={shownMonth} today={today} className="mr-1 text-sm" onPick={(iso) => router.push(`${monthHrefBase}${iso}`, { scroll: false })} />
          ) : null}
          <Link href={prev} scroll={false} aria-label={`Previous ${view}`}
            className="surface-chip flex size-7 items-center justify-center rounded-md border border-[var(--panel-border)] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
            <ChevronLeft className="size-3.5" />
          </Link>
          <Link href={todayHref} scroll={false}
            className="surface-chip rounded-md border border-[var(--panel-border)] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
            Today
          </Link>
          <Link href={next} scroll={false} aria-label={`Next ${view}`}
            className="surface-chip flex size-7 items-center justify-center rounded-md border border-[var(--panel-border)] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* Keyed by month: a day picked in one month must not stay picked in the next. */}
      {view === "month" ? <MonthView key={`${props.year}-${props.month}`} {...props} /> : <TimeGrid {...props} />}
    </div>
    <AppointmentDialog a={selected} onClose={() => setSelected(null)} />
    </FocusedAppointment.Provider>
    </OpenAppointment.Provider>
  );
}

const APPT_TONE = {
  "Awaiting confirmation": "amber", Scheduled: "cyan", Confirmed: "emerald", Held: "violet",
  Rescheduled: "amber", Cancelled: "rose", "No Show": "slate",
};

/** One row of the detail list, hidden when there is nothing to show. */
function Detail({ icon: Icon, label, children, href, leadId, wide = false, multiline = false }) {
  if (!children || children === "—") return null;
  return (
    <div className={cn("flex items-start gap-3", wide && "sm:col-span-2")}>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-[var(--panel-border)] text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="eyebrow block">{label}</span>
        <span className={cn("block text-sm", multiline ? "whitespace-pre-line break-words" : "truncate")}>
          {href ? (
            <a href={href} data-lead-id={leadId ?? undefined} className="transition-colors hover:text-primary">{children}</a>
          ) : (
            children
          )}
        </span>
      </span>
    </div>
  );
}

/**
 * What the appointment is, who to call, and the two things worth doing from
 * here: ring the contact, or open the full lead sheet.
 */
function AppointmentDialog({ a, onClose }) {
  const { role } = useRole();
  const tel = a ? telHref(a.phone) : null;

  return (
    <Dialog open={Boolean(a)} onOpenChange={(open) => (open ? null : onClose())}>
      {a ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{a.co}</DialogTitle>
            <DialogDescription>
              {a.longDate} · {a.time} {a.ampm} · {a.duration} min
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <ToneBadge tone={APPT_TONE[a.status] ?? "slate"}>{a.status}</ToneBadge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Detail icon={User} label="Contact">
              {[a.contact, a.contactTitle].filter(Boolean).join(" · ") || null}
            </Detail>
            <Detail icon={Phone} label="Phone" href={tel} leadId={a.leadId}>{a.phone}</Detail>
            <Detail icon={Mail} label="Email" href={a.email ? `mailto:${a.email}` : null}>{a.email}</Detail>
            <Detail icon={MapPin} label="Location">{a.location}</Detail>
            <Detail icon={Clock} label="Rep">{a.rep}</Detail>
            <Detail icon={FolderKanban} label="Campaign" wide>
              {[a.client, a.project].filter(Boolean).join(" · ") || null}
            </Detail>
            <Detail icon={MessageSquareText} label="Client notes" wide multiline>{a.clientNote}</Detail>
          </div>

          {/* The policy files kept with its lead: the client's people add theirs here too. */}
          {a.leadId ? (
            <div className="overflow-hidden rounded-lg border border-[var(--panel-border)]" data-appointment-files>
              <div className="px-4 pt-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Policy files</div>
              <LeadFiles leadId={a.leadId} canDelete={role !== "client"} />
            </div>
          ) : null}

          <DialogFooter>
            {tel ? (
              <Button asChild>
                <a href={tel} data-lead-id={a.leadId ?? undefined} data-lead-name={a.co || undefined}><Phone /> Call now</a>
              </Button>
            ) : (
              // Keep pointer events so the cursor and the reason still show.
              <Button disabled className="disabled:pointer-events-auto" title="No phone number on this lead">
                <Phone /> Call now
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={a.leadId ? `/leads/${a.leadId}` : "/appointments"} onClick={onClose}>
                View detail <ArrowUpRight />
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/* --------------------------------------------------------------------------
   Day and week: an hour grid with appointments placed by start time.
   -------------------------------------------------------------------------- */
// A stretch dragged across the hours snaps to the half hour, inside the note dialog's times (6 AM to 9 PM).
const DRAG_STEP = 30;
const DRAG_FIRST = 360;
const DRAG_LAST = 1260;

/**
 * The day or week by the hour. With `noteProjectId` (a project's calendar is open), dragging the
 * mouse down a day's hours marks a stretch of time and opens a note on it, from and until (a click
 * marks half an hour); appointments, notes and links under the pointer keep their own clicks.
 */
function TimeGrid({ view, title, days, byDate, rows, today, timeZone, focusId = null, blocks = null, notes = null, noteProjectId = null }) {
  const router = useRouter();
  const [nowMin, setNowMin] = useState(null);
  const [drag, setDrag] = useState(null); // { date, a, b }: minutes where it began and where the pointer is
  const [noting, setNoting] = useState(null); // { date, from, until }

  // The "now" line, refreshed every minute, on the business's clock: "today"
  // is the business's day, so the time across it must be the business's too.
  useEffect(() => {
    const clock = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || undefined, hour: "numeric", minute: "numeric", hourCycle: "h23" });
    const tick = () => {
      const parts = Object.fromEntries(clock.formatToParts(new Date()).map((p) => [p.type, p.value]));
      setNowMin(Number(parts.hour) * 60 + Number(parts.minute));
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [timeZone]);

  const timed = rows.filter((a) => a.startMin < UNTIMED);
  const untimed = rows.filter((a) => a.startMin >= UNTIMED);
  const tips = useMemo(() => appointmentTips(rows), [rows]);

  // Time blocked out on the days shown: whole days head their column, part of a day is banded across its hours.
  const shownBlocks = (blocks ?? []).filter((b) => days.some((d) => blocksDay(b, d.date)));
  const dayLong = shownBlocks.filter((b) => b.start == null);
  const partial = shownBlocks.filter((b) => b.start != null);
  const shownNotes = (notes ?? []).filter((n) => n.start != null && days.some((d) => d.date === n.date));
  const noteEnd = (n) => (n.end != null ? n.end : n.start + 30);

  // Widen the window to fit anything outside the usual working day.
  const startHour = Math.min(DEFAULT_START_HOUR, ...timed.map((a) => Math.floor(a.startMin / 60)), ...partial.map((b) => Math.floor(b.start / 60)), ...shownNotes.map((n) => Math.floor(n.start / 60)));
  const endHour = Math.max(DEFAULT_END_HOUR, ...timed.map((a) => Math.ceil(endOf(a) / 60)), ...partial.map((b) => Math.ceil(b.end / 60)), ...shownNotes.map((n) => Math.ceil(noteEnd(n) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = hours.length * HOUR_PX;
  const top = (min) => ((min - startHour * 60) / 60) * HOUR_PX;

  // The half hour under the pointer, in a day's column.
  const minuteAt = (e) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const m = startHour * 60 + Math.floor(((y / HOUR_PX) * 60) / DRAG_STEP) * DRAG_STEP;
    return Math.min(DRAG_LAST - DRAG_STEP, Math.max(DRAG_FIRST, m));
  };
  const dragStart = (e, date) => {
    if (!noteProjectId || e.button !== 0 || e.pointerType === "touch") return;
    if (e.target.closest("button, a, [data-calendar-note], [data-appointment-block]")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const m = minuteAt(e);
    setDrag({ date, a: m, b: m });
  };
  const dragMove = (e, date) => {
    if (!drag || drag.date !== date) return;
    const m = minuteAt(e);
    if (m !== drag.b) setDrag({ ...drag, b: m });
  };
  const dragEnd = () => {
    if (!drag) return;
    const from = Math.min(drag.a, drag.b);
    const until = Math.max(drag.a, drag.b) + DRAG_STEP;
    setNoting({ date: drag.date, from: clockOf(from), until: clockOf(until) });
  };
  const marked = drag ? { date: drag.date, from: Math.min(drag.a, drag.b), until: Math.max(drag.a, drag.b) + DRAG_STEP } : null;

  return (
    <Card>
      <SectionHeader
        label={title}
        icon={CalendarClock}
        action={
          <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">
            {noteProjectId ? <span className="mr-2 hidden font-normal sm:inline" data-drag-hint>Drag across the hours to add a note ·</span> : null}
            {timed.length + untimed.length} scheduled
          </span>
        }
      />

      <TipLayer tips={tips} delay={250} className="max-h-[70svh] overflow-y-auto">
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

          {dayLong.length > 0 && (
            <div className="flex border-b border-[var(--panel-border)]" data-blocked-all-day>
              <div className="flex w-14 shrink-0 items-center justify-end pr-2">
                <span className="eyebrow text-right leading-tight">All<br />day</span>
              </div>
              <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((d) => (
                  <div key={d.date} className="space-y-1 border-l border-[var(--panel-border)] p-1">
                    {dayLong.filter((b) => blocksDay(b, d.date)).map((b) => (
                      <div key={b.id} data-blocked-time-block={b.id} title={blockTitle(b)} className="flex items-center gap-1 truncate rounded px-1.5 py-1 text-[0.68rem] font-semibold" style={BLOCKED_FILL}>
                        <Ban className="size-3 shrink-0" style={{ color: "var(--neon-amber)" }} />
                        <span className="min-w-0 flex-1 truncate">{b.synced ? "Busy" : "Blocked"}{blockNote(b) ? ` · ${blockNote(b)}` : ""}</span>
                        <RemoveBlock block={b} size="size-3" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

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
                <div key={d.date} className={cn("relative border-l border-[var(--panel-border)]", d.isToday && "bg-primary/[0.04]", noteProjectId && "cursor-cell select-none")}
                  data-day-column={d.date}
                  onPointerDown={(e) => dragStart(e, d.date)} onPointerMove={(e) => dragMove(e, d.date)} onPointerUp={dragEnd}
                  onPointerCancel={() => setDrag(null)}>
                  {/* The stretch being dragged, or waiting on its note. */}
                  {marked && marked.date === d.date ? (
                    <div className="pointer-events-none absolute inset-x-0.5 z-20 rounded-md border-2 border-dashed px-1.5 py-0.5 text-[0.66rem] font-semibold"
                      style={{ top: top(marked.from), height: ((marked.until - marked.from) / 60) * HOUR_PX, borderColor: NOTED, background: `color-mix(in srgb, ${NOTED} 14%, transparent)` }}
                      data-drag-selection>
                      {clockOf(marked.from)} – {clockOf(marked.until)}
                    </div>
                  ) : null}
                  {/* Notes over a stretch of time: a soft band across it, behind the appointments. */}
                  {shownNotes.filter((n) => n.date === d.date && n.end != null).map((n) => (
                    <div key={`nb${n.id}`} aria-hidden className="pointer-events-none absolute inset-x-0.5 rounded border-l-2"
                      style={{ top: top(n.start), height: ((n.end - n.start) / 60) * HOUR_PX, borderColor: NOTED, background: `color-mix(in srgb, ${NOTED} 9%, transparent)` }}
                      data-calendar-note-band={n.id} />
                  ))}
                  {/* Blocked hours, behind the appointments: a slot booked over one still shows on top of it. */}
                  {partial.filter((b) => blocksDay(b, d.date)).map((b) => (
                    <div key={b.id} data-blocked-time-block={b.id} title={blockTitle(b)}
                      className="absolute inset-x-0.5 overflow-hidden rounded border px-1.5 py-0.5 text-[0.66rem] font-semibold leading-tight"
                      style={{ top: top(b.start), height: ((b.end - b.start) / 60) * HOUR_PX, ...BLOCKED_FILL }}>
                      <span className="flex items-center gap-1">
                        <Ban className="size-3 shrink-0" style={{ color: "var(--neon-amber)" }} />
                        <span className="min-w-0 flex-1 truncate">{b.synced ? "Busy" : "Blocked"} · {blockHours(b)}</span>
                        <RemoveBlock block={b} size="size-3" />
                      </span>
                      {blockNote(b) ? <span className="block truncate font-normal text-muted-foreground">{blockNote(b)}</span> : null}
                    </div>
                  ))}
                  {/* Notes on the day's times: a tag at the right of the slot, above the appointments so it is always read. */}
                  {shownNotes.filter((n) => n.date === d.date).map((n) => (
                    <div key={`n${n.id}`} data-calendar-note={n.id} title={noteTitle(n)}
                      className="absolute right-0.5 z-10 flex max-w-[60%] items-center gap-1 rounded border bg-popover px-1 py-px text-[0.62rem] leading-tight shadow-sm"
                      style={{ top: top(n.start) + 1, borderColor: `color-mix(in srgb, ${NOTED} 55%, transparent)` }}>
                      <StickyNote className="size-3 shrink-0" style={{ color: NOTED }} />
                      <span className="truncate">{n.text}</span>
                    </div>
                  ))}
                  {placed.map((a) => {
                    const blockTop = top(a.startMin);
                    const blockHeight = (Math.max(a.duration, MIN_BLOCK_MIN) / 60) * HOUR_PX;
                    return (
                      <div
                        key={a.id}
                        className={cn("absolute px-0.5", a.id === focusId && "z-[5]")}
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
      </TipLayer>

      {noteProjectId ? (
        <NoteDialog open={noting !== null} projectId={noteProjectId} day={noting?.date ?? today} from={noting?.from} until={noting?.until ?? ""}
          onOpenChange={(o) => { if (!o) { setNoting(null); setDrag(null); } }}
          onDone={() => { setNoting(null); setDrag(null); router.refresh(); }} />
      ) : null}

      {timed.length + untimed.length === 0 && (
        <p className="border-t border-[var(--panel-border)] py-6 text-center text-sm text-muted-foreground">
          {shownBlocks.length ? "No appointments" : "Nothing scheduled"} {view === "day" ? "on this day" : "this week"}.
        </p>
      )}
    </Card>
  );
}

/** One appointment on the time grid. Opens the detail dialog. */
function Block({ a, dense = false, compact = false }) {
  const open = useContext(OpenAppointment);
  const [focused, ref] = useFocused(a);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => open(a)}
      data-focused-appointment={focused || undefined}
      data-tip={a.id}
      // Still to be confirmed (Oct 2026): tinted in the dashboard's yellow, even as a one-line block.
      data-awaiting={a.waiting || undefined}
      style={a.waiting ? { background: "color-mix(in srgb, var(--event-waiting) 14%, var(--card))", borderColor: "color-mix(in srgb, var(--event-waiting) 45%, transparent)" } : undefined}
      aria-label={`${a.time} ${a.ampm} ${a.co}${a.waiting ? ", awaiting confirmation" : ""}`}
      className={cn(
        "flex h-full w-full min-w-0 gap-1.5 overflow-hidden rounded-md border border-[var(--panel-border)] bg-card/90 px-1.5 py-1 text-left transition-colors hover:border-primary/50 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        compact && "h-auto",
        focused && "appt-focus"
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
            <span className="block truncate text-[0.66rem] text-muted-foreground">
              {a.waiting ? <><span className="font-semibold text-[var(--event-waiting)]">{a.detail.split(" · ")[0]}</span>{a.detail.slice(a.detail.indexOf(" · "))}</> : a.detail}
            </span>
          ) : null}
        </span>
      )}
      {!dense && !compact ? (
        <span
          className="flex size-6 shrink-0 items-center justify-center self-start rounded text-[0.55rem] font-bold text-white"
          style={{ background: a.repC }}
          aria-hidden
        >
          {a.repI}
        </span>
      ) : null}
    </button>
  );
}

/* --------------------------------------------------------------------------
   Month: heat-mapped grid with a side panel for the selected day.
   -------------------------------------------------------------------------- */
function MonthView({ year, month, rows, byDay, count, todayDay, title, dayHrefBase, focusId = null, blockedDays = null, blocks = null, notes = null, today = null }) {
  // Each day's appointments as the dashboard's calendar marks them (Sean, Oct 2026): confirmed or
  // gone by in the accent, still to come and not confirmed yet in the awaiting colour.
  const kinds = useMemo(() => {
    const out = {};
    for (const a of rows ?? []) {
      const d = Number(String(a.date).slice(8, 10));
      const k = (out[d] ??= { appt: 0, waiting: 0 });
      if (!a.confirmed && today && a.date >= today) k.waiting += 1;
      else k.appt += 1;
    }
    return out;
  }, [rows, today]);
  const dayOf = (a) => Number(String(a.date).slice(8, 10));
  // Opened from a notification: show that appointment's day.
  const focusRow = focusId == null ? null : rows.find((a) => a.id === focusId);
  const [selected, setSelected] = useState(focusRow ? dayOf(focusRow) : todayDay);

  const START = new Date(year, month, 1).getDay();
  const DAYS = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < START; i++) cells.push(null);
  for (let d = 1; d <= DAYS; d++) cells.push(d);

  const busiest = Math.max(1, ...Object.values(byDay ?? {}));
  const label = (d) =>
    new Date(year, month, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const isoOf = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const dayRows = selected ? rows.filter((a) => dayOf(a) === selected) : [];
  // What is blocked out on the day picked: all day first, then by the hour.
  const dayBlocks = selected ? (blocks ?? []).filter((b) => blocksDay(b, isoOf(selected))).sort((a, b) => (a.start ?? -1) - (b.start ?? -1)) : [];
  const dayNotes = selected ? (notes ?? []).filter((n) => n.date === isoOf(selected)).sort((a, b) => a.start - b.start) : [];
  const notedDays = new Set((notes ?? []).map((n) => n.date));
  const tips = useMemo(() => appointmentTips(rows), [rows]);

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
              // Time blocked out on the project's calendar: the whole day ("day") or part of it.
              const blocked = blockedDays?.[isoOf(d)] ?? null;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(d)}
                  aria-pressed={isSelected}
                  aria-label={`${label(d)}, ${n} appointment${n === 1 ? "" : "s"}${blocked ? (blocked === "day" ? ", blocked out" : ", partly blocked out") : ""}`}
                  title={[n ? `${n} appointment${n === 1 ? "" : "s"}` : null, blocked ? (blocked === "day" ? "Blocked out" : "Partly blocked out") : null].filter(Boolean).join(" · ") || undefined}
                  data-blocked={blocked || undefined}
                  className={cn(
                    "group relative flex min-h-[4.25rem] flex-col rounded-lg border p-1.5 text-left transition-all duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    !isToday && !isSelected && "border-[var(--panel-border)] hover:border-primary/50 hover:bg-primary/5",
                    isToday && !isSelected && "border-primary/60 bg-primary/10 shadow-[0_0_18px_-6px_var(--primary)]",
                    isSelected && "border-primary bg-primary/15 ring-1 ring-primary/50 shadow-[0_0_18px_-6px_var(--primary)]"
                  )}
                  style={blocked === "day" && !isSelected
                    ? { backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--neon-amber) 22%, transparent) 0 4px, transparent 4px 9px)" }
                    : n && !isToday && !isSelected ? { background: `color-mix(in srgb, var(--primary) ${Math.round(heat * 18)}%, transparent)` } : undefined}
                >
                  <span className="flex items-center justify-between">
                    <span className={cn("text-xs font-semibold tabular-nums", isToday || isSelected ? "text-primary" : "text-foreground/80")}>{d}</span>
                    <span className="flex items-center gap-1">
                      {notedDays.has(isoOf(d)) ? <StickyNote className="size-3" style={{ color: NOTED }} aria-label="Notes" data-day-noted /> : null}
                      {blocked ? <span className="text-[0.52rem] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--neon-amber)" }}>{blocked === "day" ? "Blocked" : "Part"}</span> : null}
                    </span>
                  </span>
                  {n ? (
                    <span className="mt-auto flex items-center justify-between">
                      <span className="flex gap-0.5" data-day-dots>
                        {/* Up to three dots, those awaiting confirmation first, in the dashboard's colours. */}
                        {[...Array(kinds[d]?.waiting ?? 0).fill("waiting"), ...Array(kinds[d]?.appt ?? 0).fill("appt")].slice(0, 3).map((k, j) => (
                          <span key={j} data-dot={k} className="size-1.5 rounded-full transition-transform duration-150 group-hover:scale-150"
                            style={{ background: k === "waiting" ? "var(--event-waiting)" : "var(--event-appt)" }} />
                        ))}
                      </span>
                      <span className="text-[0.6rem] font-bold tabular-nums text-primary">{n}</span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {/* What the dots mean, as on the dashboard's calendar. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-muted-foreground" data-dot-legend>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: "var(--event-appt)" }} /> Appointment</span>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: "var(--event-waiting)" }} /> Awaiting confirmation</span>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader
          label={selected ? (selected === todayDay ? "Today" : label(selected)) : "This Month"}
          icon={CalendarClock}
          action={
            <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">
              {selected ? `${dayRows.length} appointment${dayRows.length === 1 ? "" : "s"}${dayBlocks.length ? ` · ${dayBlocks.length} blocked` : ""}` : `${count} total`}
            </span>
          }
        />
        <TipLayer tips={tips} delay={250} className="max-h-[34rem] space-y-1 overflow-y-auto p-4">
          {selected ? (
            <>
              {dayBlocks.map((b) => <BlockedRow key={b.id} b={b} />)}
              {dayNotes.map((n) => <NoteRow key={`n${n.id}`} n={n} />)}
              {dayRows.map((a) => <ApptRow key={a.id} a={a} />)}
              {dayRows.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {dayBlocks.length ? "No appointments" : "Nothing scheduled"} {selected === todayDay ? "today" : `on ${label(selected)}`}.
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
        </TipLayer>
      </Card>
    </div>
  );
}

/** Time blocked out on the day picked: when, why, by whom, and on which project's calendar when several are shown; and to take it off. */
function BlockedRow({ b }) {
  return (
    <div data-blocked-row={b.id} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2" style={BLOCKED_FILL}>
      <span className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: "var(--neon-amber)" }} />
      <Ban className="size-4 shrink-0" style={{ color: "var(--neon-amber)" }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{b.synced ? "Busy" : "Blocked"} · {blockHours(b)}</div>
        <div className="truncate text-xs text-muted-foreground" title={blockTitle(b)}>
          {[b.startsOn !== b.endsOn ? blockDays(b) : null, blockNote(b), b.project].filter(Boolean).join(" · ") || "No appointments in this time"}
        </div>
      </div>
      <RemoveBlock block={b} size="size-4" />
    </div>
  );
}

/** A note on a time of the day picked: when, what, by whom, and on which project's calendar when several are shown. */
function NoteRow({ n }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const f = new FormData();
      f.set("id", String(n.id));
      const result = await reach(() => removeCalendarNote(f));
      if (result.ok) {
        toast.success("Note taken off");
        setAsking(false);
        router.refresh();
      } else toast.error(result.error);
    });
  return (
    <div data-note-row={n.id} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2"
      style={{ background: `color-mix(in srgb, ${NOTED} 8%, transparent)` }}>
      <span className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: NOTED }} />
      <StickyNote className="size-4 shrink-0" style={{ color: NOTED }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium"><span className="tabular-nums">{noteTime(n)}</span> · <span className="break-words">{n.text}</span></div>
        <div className="truncate text-xs text-muted-foreground">{[n.by ? `by ${n.by}` : null, n.project].filter(Boolean).join(" · ") || "Note"}</div>
      </div>
      <button type="button" onClick={() => setAsking(true)} disabled={pending} aria-label="Take this note off the calendar" title="Take it off the calendar" data-remove-note
        className="shrink-0 rounded text-muted-foreground transition-colors hover:text-destructive"><X className="size-4" /></button>
      <ConfirmDialog open={asking} onOpenChange={setAsking} pending={pending} title="Take this note off the calendar?"
        description={`${noteTime(n)}: ${n.text}`} confirm="Take it off" onConfirm={remove} />
    </div>
  );
}

function ApptRow({ a }) {
  const open = useContext(OpenAppointment);
  const [focused, ref] = useFocused(a);
  return (
    <button ref={ref} type="button" onClick={() => open(a)} data-list-row
      data-focused-appointment={focused || undefined}
      data-tip={a.id}
      className={cn("-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left", focused && "appt-focus")}>
      <span className={cn("h-9 w-[3px] shrink-0 rounded-full", a.bar)} />
      <div className="w-14 shrink-0 text-sm font-bold tabular-nums">
        {a.time}
        <span className="block text-[0.58rem] font-semibold tracking-[0.1em] text-muted-foreground">{a.ampm}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{a.co}</div>
        {/* Still to be confirmed: said, in the dashboard's yellow (Oct 2026). */}
        <div className={cn("truncate text-xs", a.waiting ? "font-semibold text-[var(--event-waiting)]" : "text-muted-foreground")} data-awaiting={a.waiting || undefined}>
          {a.detail.split(" · ")[0]}
        </div>
      </div>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-bold text-white"
        style={{ background: a.repC }} aria-label={a.rep}>
        {a.repI}
      </span>
    </button>
  );
}
