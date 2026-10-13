"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Ban, CalendarCheck, CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "@/components/shared/intent-link";
import SectionHeader from "@/components/shared/section-header";
import DatePicker from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addMonths, formatIso, monthGrid, monthStart, sameMonth } from "@/lib/dates";
import { BLOCK_TIMES, blockDays, blockHours, dayMarks, eventsOn } from "@/lib/project-calendar";
import { cn } from "@/lib/utils";
import { addCalendarBlock, removeCalendarBlock } from "@/features/calendar/actions";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const BLOCKED = "var(--neon-amber)";

/** Block out days, or a time of day on them, on this calendar. */
export function BlockDialog({ open, onOpenChange, projectId, day, onDone }) {
  const [state, action, pending] = useActionState(addCalendarBlock, EMPTY);
  const [allDay, setAllDay] = useState(true);
  const { fe, invalid } = formHelpers(state, null);
  const handled = useRef(null);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      toast.success("Blocked out on the calendar");
      onDone();
    } else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state, onDone]);
  useEffect(() => {
    if (open) setAllDay(true);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Block out time</DialogTitle>
          <DialogDescription>Days, or a time of day, when no appointments should be set. It shows on this calendar, and anyone booking over it is warned.</DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4" data-block-form>
          <input type="hidden" name="project_id" value={projectId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" required error={fe("starts_on")}>
              <DatePicker name="starts_on" required defaultValue={day} key={`s${day}${open}`} invalid={invalid("starts_on")} aria-label="First day" min="today" />
            </Field>
            <Field label="To" error={fe("ends_on")} hint="Leave empty for one day">
              <DatePicker name="ends_on" key={`e${day}${open}`} invalid={invalid("ends_on")} aria-label="Last day" min="today" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="hidden" name="all_day" value="off" />
            <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            All day
          </label>
          {allDay ? null : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" required error={fe("start_time")}>
                <Select name="start_time" defaultValue="10:00 AM" aria-invalid={invalid("start_time")} aria-label="Blocked from">
                  {BLOCK_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="Until" required error={fe("end_time")}>
                <Select name="end_time" defaultValue="1:00 PM" aria-invalid={invalid("end_time")} aria-label="Blocked until">
                  {BLOCK_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
            </div>
          )}
          <Field label="Note" error={fe("note")} hint="e.g. Out of office, staff meeting">
            <Input name="note" maxLength={200} aria-invalid={invalid("note")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}><Ban /> {pending ? "Saving…" : "Block out"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A project's calendar: the month at a glance (days with appointments
 * marked and counted, blocked days shaded), and the chosen day's
 * appointments and blocked time beside it. Time is blocked out and taken
 * off here. A DB dev project shows the appointment project's it promotes to.
 *
 *   projectId  any project; the calendar it resolves to is `initial.projectId`
 *   initial    getProjectCalendar() for the months around today
 *   leadLinks  appointments link to their lead sheet (staff)
 */
export default function ProjectCalendar({ projectId, initial, today, leadLinks = false, title = "Project Calendar", className }) {
  const router = useRouter();
  const [month, setMonth] = useState(monthStart(today));
  const [selected, setSelected] = useState(today);
  const [extra, setExtra] = useState({}); // months read beyond what the page arrived with
  const [blocking, setBlocking] = useState(false);
  const [removing, startRemoving] = useTransition();
  const calendarId = initial.projectId;

  // What the page arrives with is fresh after every change: months read since are read again.
  useEffect(() => setExtra({}), [initial]);

  const grid = useMemo(() => monthGrid(month), [month]);
  const covered = grid[0] >= initial.from && grid[41] <= initial.to;
  useEffect(() => {
    if (covered || extra[month]) return;
    let live = true;
    fetch(`/api/project-calendar?project=${calendarId}&from=${grid[0]}&to=${grid[41]}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => live && data && setExtra((x) => ({ ...x, [month]: data })))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [covered, extra, month, grid, calendarId]);

  const data = covered ? initial : extra[month] ?? { appointments: [], blocks: [] };
  const marks = useMemo(() => dayMarks(data, grid[0], grid[41]), [data, grid]);
  const events = eventsOn(selected, data);
  const reload = () => {
    setBlocking(false);
    router.refresh();
  };
  const remove = (id) =>
    startRemoving(async () => {
      const f = new FormData();
      f.set("id", String(id));
      const result = await removeCalendarBlock(f);
      if (result.ok) {
        toast.success("Taken off the calendar");
        router.refresh();
      } else toast.error(result.error);
    });
  const step = "flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <Card data-project-calendar={calendarId} className={className}>
      <SectionHeader wrap label={title} icon={CalendarRange}
        action={
          <Link href={`/calendar?project=${calendarId}&view=month&d=${month}`} className="flex items-center gap-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary hover:underline">
            Full calendar <ArrowRight className="size-3" />
          </Link>
        } />
      <p className="truncate px-4 pt-2 text-xs text-muted-foreground" title={initial.name}>{initial.name}</p>
      <div className="grid grid-cols-1 gap-3 p-4 pt-2 min-[420px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* The month */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <button type="button" className={step} onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft className="size-3.5" /></button>
            <span className="text-xs font-semibold" data-calendar-month>{formatIso(month, "month")}</span>
            <button type="button" className={step} onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight className="size-3.5" /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center" role="grid" aria-label={formatIso(month, "month")}>
            {DOW.map((d, i) => <div key={i} className="text-[0.55rem] font-bold uppercase text-muted-foreground">{d}</div>)}
            {grid.map((day) => {
              const m = marks[day];
              const dim = !sameMonth(day, month);
              return (
                <button key={day} type="button" onClick={() => setSelected(day)} data-day={day}
                  data-appointments={m?.appointments || undefined} data-blocked={m?.blocked || undefined}
                  aria-pressed={day === selected}
                  aria-label={`${formatIso(day, "long")}: ${m?.appointments ? `${m.appointments} appointment${m.appointments === 1 ? "" : "s"}` : "no appointments"}${m?.blocked ? (m.blocked === "day" ? ", blocked out" : ", partly blocked out") : ""}`}
                  className={cn(
                    "relative flex h-8 flex-col items-center justify-start rounded border pt-0.5 text-[0.68rem] tabular-nums transition-colors",
                    day === selected ? "border-primary bg-primary/15 font-semibold text-primary" : day === today ? "border-primary/50" : "border-transparent hover:bg-muted",
                    dim && day !== selected && "text-muted-foreground/40"
                  )}
                  // A day blocked whole is shaded; in part, underlined.
                  style={m?.blocked === "day" ? { background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${BLOCKED} 28%, transparent) 0 3px, transparent 3px 6px)` } : undefined}>
                  {Number(day.slice(8))}
                  <span className="mt-px flex h-1.5 items-center gap-px">
                    {m?.appointments ? <span className="rounded-full bg-primary px-[3px] text-[0.5rem] font-bold leading-[0.6rem] text-primary-foreground">{m.appointments}</span> : null}
                    {m?.blocked === "part" ? <span className="h-1 w-2 rounded-full" style={{ background: BLOCKED }} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6rem] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-primary" /> Appointments</span>
            <span className="flex items-center gap-1"><span className="h-1 w-2 rounded-full" style={{ background: BLOCKED }} /> Blocked out</span>
          </div>
        </div>

        {/* The chosen day */}
        <div className="flex min-w-0 flex-col" data-calendar-day={selected}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold">{selected === today ? "Today" : formatIso(selected, "long")}</span>
            <span className="shrink-0 text-[0.62rem] text-muted-foreground">{events.filter((e) => e.kind === "appointment").length} appt{events.filter((e) => e.kind === "appointment").length === 1 ? "" : "s"}</span>
          </div>
          <ul className={cn("max-h-52 flex-1 space-y-1 overflow-y-auto", removing && "opacity-60")}>
            {events.map((e) => e.kind === "block" ? (
              <li key={e.key} data-block={e.block.id} data-synced={e.block.synced || undefined} className="flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs"
                style={{ borderColor: `color-mix(in srgb, ${BLOCKED} 45%, transparent)`, background: `color-mix(in srgb, ${BLOCKED} 8%, transparent)` }}>
                <Ban className="mt-0.5 size-3.5 shrink-0" style={{ color: BLOCKED }} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{e.block.synced ? "Busy" : "Blocked"} · {blockHours(e.block)}</span>
                  <span className="block truncate text-muted-foreground" title={e.block.note ?? undefined}>
                    {e.block.synced
                      // From someone's own calendar: when they are busy, and nothing about why.
                      ? (e.block.by ? `${e.block.by}'s calendar` : "A connected calendar")
                      : [e.block.startsOn !== e.block.endsOn ? blockDays(e.block) : null, e.block.note, e.block.by ? `by ${e.block.by}` : null].filter(Boolean).join(" · ") || "No appointments"}
                  </span>
                </span>
                {e.block.synced ? null : (
                <button type="button" onClick={() => remove(e.block.id)} disabled={removing} aria-label="Take this block off the calendar" title="Take it off the calendar" data-remove-block
                  className="shrink-0 rounded text-muted-foreground transition-colors hover:text-destructive"><X className="size-3.5" /></button>
                )}
              </li>
            ) : (
              <li key={e.key} data-appointment={e.appointment.id} className="flex items-start gap-1.5 rounded-md bg-primary/8 px-2 py-1.5 text-xs">
                <CalendarCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold tabular-nums">{e.appointment.time ?? "No time"}</span>
                  <span className="text-muted-foreground"> · {e.appointment.duration} min{e.appointment.confirmed ? " · confirmed" : ""}</span>
                  {leadLinks && e.appointment.leadId ? (
                    <Link href={`/leads/${e.appointment.leadId}`} className="block truncate hover:text-primary">{e.appointment.company ?? "Appointment"}</Link>
                  ) : <span className="block truncate">{e.appointment.company ?? "Appointment"}</span>}
                </span>
              </li>
            ))}
            {events.length === 0 ? <li className="py-4 text-center text-xs text-muted-foreground">Nothing on this day.</li> : null}
          </ul>
          <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={() => setBlocking(true)} disabled={selected < today} data-block-out>
            <Ban /> Block out time
          </Button>
        </div>
      </div>
      <BlockDialog open={blocking} onOpenChange={setBlocking} projectId={calendarId} day={selected < today ? today : selected} onDone={reload} />
    </Card>
  );
}
