"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartLine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatIso } from "@/lib/dates";
import { clockOf } from "@/lib/project-calendar";
import { knownZone, zoneShort } from "@/lib/own-clock";

// The working day the chart always shows (6 AM to 7 PM), widened for any call outside it.
const FIRST = 6 * 60;
const LAST = 19 * 60;
const W = 720;
const H = 260;
const PAD = { left: 40, right: 16, top: 16, bottom: 30 };
// A stretch this long with no calls, between a person's first call and their last (or now), is named.
const GAP_SLOTS = 2;

const label = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}${m % 60 ? ":30" : ""}${m < 720 ? "a" : "p"}`;
const span = (mins) => (mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}` : `${mins}m`);

/** Minutes past midnight now, in the business's time zone. */
function nowMinutes(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || undefined, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
}

/**
 * Call Activity's chart (Sean, Nov 2026): the day's calls added up through the day, half hour by half
 * hour, for everyone on the card or one person, so a long stretch with no calls shows as a flat line
 * (the longest is shaded and named). `day` the day shown; `people` [{ id, name, timeZone }] the card's;
 * `scope`, `userId` as the card asks for its numbers; `today`, `timeZone` the business's. One person
 * shown: on their own clock (their account's time zone); everyone: on the business's, since half hours
 * on different clocks are different times.
 */
export default function CallTimesChart({ day, today, people, scope, userId, timeZone }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("all");
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let gone = false;
    setSlots(null);
    setError("");
    fetch(`/api/phone/calls/times?day=${day}&cs=${scope}${userId ? `&cu=${userId}` : ""}`, { cache: "no-store" })
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error)))))
      .then((d) => !gone && setSlots(d.slots ?? []))
      .catch((err) => !gone && setError(err.message || "The chart is unavailable right now."));
    return () => {
      gone = true;
    };
  }, [open, day, scope, userId]);

  // One person: their clock. Everyone: the business's.
  const person = who !== "all" ? people.find((p) => String(p.id) === who) : people.length === 1 ? people[0] : null;
  const zone = knownZone(person?.timeZone, timeZone) || undefined;
  const local = Boolean(person);

  const chart = useMemo(() => {
    if (!slots) return null;
    const mine = slots.filter((s) => who === "all" || String(s.userId) === who);
    const per = new Map();
    for (const s of mine) {
      const at = local ? s.localSlot : s.slot;
      per.set(at, (per.get(at) ?? 0) + s.calls);
    }
    const times = [...per.keys()];
    const from = Math.min(FIRST, ...times);
    // Today: up to now, not a flat line into hours still to come.
    const upTo = day === today ? Math.floor(nowMinutes(zone) / 30) * 30 : null;
    const to = Math.max(LAST, ...times.map((t) => t + 30));
    const xs = [];
    for (let m = from; m < to; m += 30) xs.push(m);
    let total = 0;
    const points = xs.map((m) => {
      const n = per.get(m) ?? 0;
      total += n;
      return { m, n, total, future: upTo != null && m > upTo };
    });
    // The longest stretch with no calls between the first call and the last (or now).
    const firstAt = times.length ? Math.min(...times) : null;
    const endAt = times.length ? (upTo != null ? Math.max(upTo, ...times) : Math.max(...times)) : null;
    let gap = null;
    let run = null;
    for (const p of points) {
      if (firstAt == null || p.m <= firstAt || p.m > endAt) continue;
      if (p.n === 0) run = run ? { ...run, to: p.m + 30 } : { from: p.m, to: p.m + 30 };
      else run = null;
      if (run && (!gap || run.to - run.from > gap.to - gap.from)) gap = { ...run };
    }
    if (gap && gap.to - gap.from < GAP_SLOTS * 30) gap = null;
    const max = Math.max(5, total);
    const top = Math.ceil(max / 5) * 5;
    return { points: points.filter((p) => !p.future), all: points, total, firstAt, gap, top, from, to };
  }, [slots, who, day, today, zone, local]);

  const [hover, setHover] = useState(null);
  const x = (m) => PAD.left + ((m - (chart?.from ?? FIRST)) / ((chart?.to ?? LAST) - 30 - (chart?.from ?? FIRST))) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - v / (chart?.top || 5)) * (H - PAD.top - PAD.bottom);
  const ticks = chart ? [0, 1, 2, 3, 4, 5].map((i) => (chart.top / 5) * i) : [];
  const name = person?.name ?? "Everyone";
  const zoneName = zoneShort(zone, new Date(`${day}T12:00:00Z`));
  const clockNote = zoneName ? (person && zone !== timeZone && zoneName !== zoneShort(timeZone, new Date(`${day}T12:00:00Z`))
    ? `Times in ${zoneName}, ${person.name}'s time zone.` : `Times in ${zoneName}.`) : "";
  const shown = hover != null ? chart?.points[hover] : null;

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} data-call-chart-open>
        <ChartLine /> Chart
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl" data-call-chart>
          <DialogHeader>
            <DialogTitle>Calls through the day</DialogTitle>
            <DialogDescription>{formatIso(day, "long")} · calls on the Lighthouse phone, added up half hour by half hour. A flat stretch is time with no calls. <span data-call-chart-zone>{clockNote}</span></DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Show</span>
              <select value={who} onChange={(e) => { setWho(e.target.value); setHover(null); }} data-call-chart-who
                className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                <option value="all">{people.length > 1 ? "Everyone" : people[0]?.name ?? "Everyone"}</option>
                {people.length > 1 ? people.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>) : null}
              </select>
            </label>
            {chart ? (
              <p className="text-sm" data-call-chart-summary>
                <span className="font-semibold tabular-nums">{chart.total}</span> call{chart.total === 1 ? "" : "s"}
                {chart.firstAt != null ? <span className="text-muted-foreground"> · first {clockOf(chart.firstAt)}–{clockOf(chart.firstAt + 30)}</span> : null}
                {chart.gap ? <span className="text-muted-foreground" data-call-chart-gap> · longest gap {clockOf(chart.gap.from)} – {clockOf(chart.gap.to)} ({span(chart.gap.to - chart.gap.from)})</span> : null}
              </p>
            ) : null}
          </div>
          {error ? <p className="py-10 text-center text-sm text-destructive">{error}</p>
            : !chart ? <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading the day&apos;s calls…</p>
            : (
              <div className="relative">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${name}: ${chart.total} calls on ${formatIso(day, "medium")}`} onMouseLeave={() => setHover(null)}>
                  {ticks.map((t) => (
                    <g key={t}>
                      <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--panel-border)" strokeWidth="1" />
                      <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{t}</text>
                    </g>
                  ))}
                  {chart.gap ? (
                    <g data-gap>
                      <rect x={x(chart.gap.from)} width={Math.max(2, x(chart.gap.to - 30) - x(chart.gap.from))} y={PAD.top} height={H - PAD.top - PAD.bottom}
                        fill="color-mix(in srgb, var(--muted-foreground) 12%, transparent)" />
                      <text x={(x(chart.gap.from) + x(chart.gap.to - 30)) / 2} y={PAD.top + 12} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">no calls</text>
                    </g>
                  ) : null}
                  {chart.all.map((p, i) => (p.m % 60 === 0 ? (
                    <text key={p.m} x={x(p.m)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">{label(p.m)}</text>
                  ) : null))}
                  <polyline fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                    points={chart.points.map((p) => `${x(p.m)},${y(p.total)}`).join(" ")} data-call-chart-line />
                  {shown ? (
                    <g>
                      <line x1={x(shown.m)} x2={x(shown.m)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeWidth="1" />
                      <circle cx={x(shown.m)} cy={y(shown.total)} r="5" fill="var(--primary)" stroke="var(--card)" strokeWidth="2" />
                    </g>
                  ) : null}
                  {chart.points.map((p, i) => (
                    <rect key={p.m} x={x(p.m) - (x(p.m + 30) - x(p.m)) / 2} width={x(p.m + 30) - x(p.m)} y={PAD.top} height={H - PAD.top - PAD.bottom}
                      fill="transparent" onMouseEnter={() => setHover(i)} />
                  ))}
                </svg>
                {shown ? (
                  <div className="pointer-events-none absolute top-1 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
                    style={{ left: `${(x(shown.m) / W) * 100}%`, transform: `translateX(${x(shown.m) > W / 2 ? "-105%" : "5%"})` }} data-call-chart-tip>
                    <div className="font-semibold">{clockOf(shown.m)} – {clockOf(shown.m + 30)}</div>
                    <div className="text-muted-foreground">{shown.n} call{shown.n === 1 ? "" : "s"} · {shown.total} so far</div>
                  </div>
                ) : null}
              </div>
            )}
        </DialogContent>
      </Dialog>
    </>
  );
}
