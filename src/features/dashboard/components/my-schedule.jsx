"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlarmClock, BellRing, CalendarCheck, CalendarClock, ChevronLeft, ChevronRight, GripVertical, Loader2, Move, MoveRight } from "lucide-react";
import Link from "@/components/shared/intent-link";
import SectionHeader from "@/components/shared/section-header";
import DatePicker from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addMonths, formatIso, monthGrid, sameMonth } from "@/lib/dates";
import { APPOINTMENT_TIMES, REMINDER_TIMES } from "@/lib/validate";
import { cn } from "@/lib/utils";
import { moveScheduleItem } from "@/features/dashboard/actions";
import { dashboardHref } from "@/features/dashboard/components/period-switch";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

// Each kind's colour and icon, on the calendar's dots and the list.
const KINDS = {
  appointment: { color: "var(--neon-emerald)", icon: CalendarCheck, label: "Appointment" },
  waiting: { color: "var(--neon-amber)", icon: CalendarCheck, label: "Awaiting confirmation" },
  reminder: { color: "var(--neon-cyan)", icon: AlarmClock, label: "Reminder" },
  message: { color: "var(--neon-violet)", icon: BellRing, label: "From an administrator" },
};
const kindOf = (item) => (item.kind === "appointment" && item.waiting ? "waiting" : item.kind);

const BADGE = {
  ok: "border-emerald-400/40 text-emerald-400",
  warn: "border-amber-400/45 text-amber-400",
  info: "border-violet-400/40 text-violet-400",
  muted: "border-slate-400/30 text-muted-foreground",
};

/**
 * What follows the pointer while an item is dragged: a solid card saying
 * what is moving, in place of the browser's faint copy of the row. Built
 * from text nodes (titles are data), and gone once the browser has its image.
 */
function dragCard(event, item) {
  const card = document.createElement("div");
  card.className = "drag-ghost";
  const label = document.createElement("span");
  label.className = "drag-ghost-label";
  label.textContent = `Moving ${item.kind === "reminder" ? "reminder" : "appointment"}`;
  const title = document.createElement("span");
  title.className = "drag-ghost-title";
  title.textContent = `${item.time} · ${item.title}`;
  card.append(label, title);
  document.body.append(card);
  event.dataTransfer.setDragImage(card, 18, 18);
  setTimeout(() => card.remove(), 0);
}

/** Move an item to another day, and time (what it had, unless chosen). */
function MoveDialog({ item, onClose, onMoved }) {
  const [day, setDay] = useState(item?.day ?? "");
  const [time, setTime] = useState(item?.clock ?? "");
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    setDay(item?.day ?? "");
    setTime(item?.clock ?? "");
    setError(null);
  }, [item]);
  const base = item?.kind === "reminder" ? REMINDER_TIMES : APPOINTMENT_TIMES;
  const times = item?.clock && !base.includes(item.clock) ? [item.clock, ...base] : base;

  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const result = await onMoved(item, day, time);
      if (result?.ok) onClose();
      else setError(result?.error ?? "That did not move.");
    });
  };

  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move {item?.kind === "reminder" ? "this reminder" : "this appointment"}</DialogTitle>
          <DialogDescription>{item?.title}{item ? ` · now ${formatIso(item.day, "long")} at ${item.clock}` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-move-form>
          {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
            <Field label="Day" required>
              <DatePicker name="date" value={day} onChange={setDay} min="today" aria-label="New day" presets={["today", "tomorrow", "nextMonday"]} future />
            </Field>
            <Field label="Time" required>
              <Select name="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="New time">
                {times.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending || !day || !time}><MoveRight /> {pending ? "Moving…" : "Move"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The manager's own calendar (row two of their dashboard): the month on the
 * left, a dot for each thing on a day, and the chosen day's list on the
 * right (today to begin with) — the appointments they set (confirmed, or
 * awaiting confirmation), their call-back reminders, and what
 * administrators sent them. An appointment or reminder still to come moves
 * by dragging it onto another day, or with Move for a new day and time.
 *
 *   items     getMySchedule() for the days the month shows
 *   month     the month on show ("YYYY-MM-01"); `params` the rest of the address
 */
export default function MySchedule({ items, awaiting, month, today, params }) {
  const router = useRouter();
  const grid = useMemo(() => monthGrid(month), [month]);
  const [selected, setSelected] = useState(sameMonth(today, month) ? today : month);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [moving, setMoving] = useState(null);
  // Moved, waiting for the server: shown on its new day at once, with a spinner.
  const [moved, setMoved] = useState(null);
  // The day something just landed on, rippling.
  const [landed, setLanded] = useState(null);
  const [, startBusy] = useTransition();

  // Another month: its first day, or today when it is this month.
  useEffect(() => {
    setSelected((s) => (grid.includes(s) ? s : sameMonth(today, month) ? today : month));
  }, [grid, month, today]);

  // The server's answer arrives with fresh items: the move is done.
  useEffect(() => setMoved(null), [items]);
  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => setLanded(null), 1700);
    return () => clearTimeout(t);
  }, [landed]);

  const shown = useMemo(
    () => items.map((it) => (it.key === moved?.key ? { ...it, day: moved.day, time: moved.time, pending: true } : it)),
    [items, moved]
  );
  const byDay = useMemo(() => {
    const m = new Map();
    for (const it of shown) m.set(it.day, [...(m.get(it.day) ?? []), it]);
    return m;
  }, [shown]);
  const dragged = dragging ? items.find((it) => it.key === dragging) : null;
  const list = byDay.get(selected) ?? [];

  const move = async (item, day, time) => {
    const f = new FormData();
    f.set("kind", item.kind);
    f.set("id", String(item.id));
    f.set("date", day);
    f.set("time", time);
    setMoved({ key: item.key, day, time });
    setSelected(day);
    const result = await moveScheduleItem(f);
    if (result.ok) {
      toast.success(`Moved to ${formatIso(day, "long")} at ${time}`);
      setLanded(day);
      router.refresh();
    } else {
      setMoved(null);
      setSelected(item.day);
      toast.error(result.error);
    }
    return result;
  };

  const drop = (day) => {
    const item = items.find((it) => it.key === dragging);
    setDragging(null);
    setOver(null);
    if (!item || day === item.day) return;
    startBusy(async () => { await move(item, day, item.clock); });
  };

  const monthHref = (iso) => dashboardHref(params, { cm: iso.slice(0, 7) });
  const dayName = selected === today ? "Today" : formatIso(selected, "long");

  return (
    <Card data-my-schedule className="flex flex-col">
      <SectionHeader wrap label="Today's Schedule" icon={CalendarClock}
        action={awaiting ? (
          <span className="rounded-full border border-amber-400/45 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-amber-400" data-awaiting>
            {awaiting} awaiting confirmation
          </span>
        ) : null} />
      <div className="grid flex-1 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* The month */}
        <div className="relative border-b border-[var(--panel-border)] p-4 sm:border-r sm:border-b-0">
          {dragged ? (
            // While dragging: what is moving, and where it would go.
            <div data-drag-banner role="status"
              className="animate-pop-in pointer-events-none absolute inset-x-3 top-2.5 z-10 flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-lg">
              <Move className="size-3.5 shrink-0" />
              <span className="truncate">
                {over
                  ? <>Move to <strong>{formatIso(over, "long")}</strong> at {dragged.clock}</>
                  : <>Drop <strong>{dragged.title}</strong> on a day to move it</>}
              </span>
            </div>
          ) : null}
          <div className="mb-2 flex items-center justify-between">
            <Link href={monthHref(addMonths(month, -1))} scroll={false} aria-label="Previous month"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <ChevronLeft className="size-4" />
            </Link>
            <span className="text-sm font-semibold" data-schedule-month>{formatIso(month, "month")}</span>
            <Link href={monthHref(addMonths(month, 1))} scroll={false} aria-label="Next month"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={formatIso(month, "month")}>
            {DOW.map((d, i) => <div key={i} className="pb-1 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{d}</div>)}
            {grid.map((day) => {
              const here = byDay.get(day) ?? [];
              const inMonth = sameMonth(day, month);
              const canDrop = Boolean(dragging) && day >= today && day !== dragged?.day;
              return (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  onClick={() => setSelected(day)}
                  onDragOver={(e) => { if (canDrop) { e.preventDefault(); setOver(day); } }}
                  onDragLeave={() => setOver((o) => (o === day ? null : o))}
                  onDrop={(e) => { e.preventDefault(); if (canDrop) drop(day); }}
                  aria-pressed={day === selected}
                  aria-label={`${formatIso(day, "long")}: ${here.length ? `${here.length} item${here.length === 1 ? "" : "s"}` : "nothing"}`}
                  className={cn(
                    "flex h-11 flex-col items-center justify-start rounded-md border pt-1 text-xs tabular-nums transition-[colors,transform,box-shadow] duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    day === selected ? "border-primary bg-primary/15 font-semibold text-primary"
                      : day === today ? "border-primary/50 text-primary"
                      : "border-transparent hover:bg-muted",
                    !inMonth && day !== selected && "text-muted-foreground/50",
                    dragging && !canDrop && "cursor-not-allowed opacity-30",
                    canDrop && over !== day && "drop-target border-dashed",
                    over === day && "drop-over",
                    landed === day && "drop-landed"
                  )}
                >
                  {Number(day.slice(8))}
                  {over === day ? (
                    <span className="pointer-events-none mt-0.5 text-[0.5rem] font-bold uppercase tracking-[0.1em] text-primary">Drop</span>
                  ) : here.length ? (
                    <span className="pointer-events-none mt-1 flex gap-0.5">
                      {here.slice(0, 3).map((it) => <span key={it.key} className="size-1.5 rounded-full" style={{ background: KINDS[kindOf(it)].color }} />)}
                      {here.length > 3 ? <span className="text-[0.5rem] leading-[0.375rem]">+</span> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.6rem] text-muted-foreground">
            {["appointment", "waiting", "reminder", "message"].map((k) => (
              <span key={k} className="flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: KINDS[k].color }} />{KINDS[k].label}</span>
            ))}
          </div>
        </div>

        {/* The chosen day */}
        <div className="flex min-w-0 flex-col p-4" data-schedule-day={selected}>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{dayName}</span>
            <span className="text-[0.66rem] text-muted-foreground">{list.length} item{list.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {list.map((it) => {
              const k = KINDS[kindOf(it)];
              const Icon = k.icon;
              return (
                <li
                  key={it.key}
                  data-schedule-item={it.key}
                  draggable={it.movable && !it.pending}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", it.key);
                    dragCard(e, it);
                    setDragging(it.key);
                  }}
                  onDragEnd={() => { setDragging(null); setOver(null); }}
                  data-dragging={dragging === it.key || undefined}
                  className={cn(
                    "group flex items-start gap-2.5 rounded-lg border border-transparent px-2 py-2 transition-colors hover:bg-muted/60",
                    it.movable && !it.pending && "cursor-grab active:cursor-grabbing",
                    // Where it was picked up from: an outline left behind.
                    dragging === it.key && "border-dashed border-primary/60 bg-primary/5 opacity-50",
                    it.pending && "border-primary/40 bg-primary/5"
                  )}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${k.color} 14%, transparent)`, color: k.color }}>
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-bold tabular-nums">{it.time}</span>
                      {it.href ? (
                        <Link href={it.href} draggable={false} className="truncate text-sm font-medium transition-colors hover:text-primary">{it.title}</Link>
                      ) : <span className="truncate text-sm font-medium">{it.title}</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{it.detail}</div>
                    {it.result || it.badge ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {/* A reminder: the name's last call result, so the call back has its reason. */}
                        {it.result ? (
                          <span data-call-result title="Last call result" className="inline-block rounded-full border border-sky-400/40 px-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-sky-500">
                            {it.result}
                          </span>
                        ) : null}
                        {it.badge ? <span className={cn("inline-block rounded-full border px-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.08em]", BADGE[it.tone] ?? BADGE.muted)}>{it.badge}</span> : null}
                      </span>
                    ) : null}
                  </div>
                  {it.pending ? (
                    <span className="flex shrink-0 items-center gap-1 text-[0.62rem] font-semibold text-primary" data-moving>
                      <Loader2 className="size-3.5 animate-spin" /> Moving…
                    </span>
                  ) : it.movable ? (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button type="button" onClick={() => setMoving(it)} aria-label={`Move ${it.title}`} title="Move to another day or time" data-move={it.key}
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary">
                        <MoveRight className="size-3.5" />
                      </button>
                      <GripVertical aria-hidden className="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                    </span>
                  ) : null}
                </li>
              );
            })}
            {list.length === 0 ? (
              <li className="py-8 text-center text-sm text-muted-foreground">Nothing scheduled {selected === today ? "today" : "this day"}.</li>
            ) : null}
          </ul>
          {list.some((it) => it.movable) ? (
            <p className="mt-auto pt-2 text-[0.62rem] text-muted-foreground">Drag onto a day to move it, or use <MoveRight className="inline size-3" /> for a new time.</p>
          ) : null}
        </div>
      </div>
      <MoveDialog item={moving} onClose={() => setMoving(null)} onMoved={move} />
    </Card>
  );
}
