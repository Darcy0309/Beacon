"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { DAY_NAMES, MIN_CALLS, MODES, bestSpan, hourLabel, hourSpan, pct, rateOf, weekOf, windows } from "@/lib/best-times";

// The heat ramp, light to dark (theme-aware: the app's own accent, at rising strength).
const STEPS = [8, 18, 32, 48, 66, 86];
const BY_TITLE = { sic: "Industry (SIC)", state: "State", type: "Project type", manager: "Manager" };
const BY_PHRASE = { sic: "industry (SIC)", state: "state", type: "project type", manager: "manager" };

/**
 * The Production Heat Map (Sean and Darcy, Nov 2026; first Best Times to Call): the week by day and hour in the business's local time, each square
 * shaded by how its calls turned into leads, appointments or either (an hour with too few calls greyed out); the
 * best and worst hours; and the breakdown chosen, each with its best two hours on weekdays.
 * `rows`: best_times() for the filters; `byRows` the same broken down by `by`.
 */
export default function BestTimesBoard({ rows, byRows, by }) {
  const [mode, setMode] = useState("both");
  const [tip, setTip] = useState(null);
  const week = useMemo(() => weekOf(rows), [rows]);
  const judged = week.cells.filter((c) => c.calls >= MIN_CALLS);
  const rates = judged.map((c) => rateOf(c, mode));
  const lo = Math.min(...rates), hi = Math.max(...rates);
  const { best, worst } = windows(week, mode);
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of byRows) {
      if (!m.has(r.dim)) m.set(r.dim, { dim: r.dim, label: r.label, rows: [] });
      m.get(r.dim).rows.push(r);
    }
    return [...m.values()].map((g) => ({ ...g, week: weekOf(g.rows) })).sort((a, b) => b.week.total.calls - a.week.total.calls).slice(0, 25);
  }, [byRows]);
  const what = mode === "leads" ? "to leads" : mode === "appts" ? "to appointments" : "to leads or appointments";

  const line = (c, i, tone) => (
    <li key={`${c.dow}-${c.hour}`} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 border-t border-[var(--panel-border)] px-5 py-2.5 first:border-t-0">
      <span className="font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
      <span>
        <span className="font-medium">{DAY_NAMES[c.dow - 1]} {hourSpan(c.hour)}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">{c.calls.toLocaleString()} calls · {c.leads} leads · {c.appts} appts</span>
      </span>
      <span className={cn("font-bold tabular-nums", tone)}>{pct(c.rate)}</span>
    </li>
  );

  return (
    <div className="space-y-4" data-best-times>
      <section className="rounded-xl border border-[var(--panel-border)] bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--panel-border)] px-5 py-3">
          <div>
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">By day and hour, in the business&apos;s local time</p>
            <p className="text-xs text-muted-foreground tabular-nums" data-best-total>
              {week.total.calls.toLocaleString()} calls · {week.total.leads.toLocaleString()} leads · {week.total.appts.toLocaleString()} appointments · {pct(rateOf(week.total, mode))} {what}
            </p>
          </div>
          <div className="inline-flex rounded-md border border-[var(--panel-border)] bg-background/40 p-0.5" role="group" aria-label="What the squares show">
            {MODES.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={mode === key} onClick={() => setMode(key)} data-best-mode={key}
                className={cn("rounded px-3 py-1 text-xs font-semibold transition-colors", mode === key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {week.total.calls ? (
          <div className="overflow-x-auto px-5 py-4">
            <div className="grid min-w-[40rem] gap-1 tabular-nums" style={{ gridTemplateColumns: `3rem repeat(${week.hours.length}, minmax(2.75rem, 1fr))` }} data-best-grid>
              <span />
              {week.hours.map((h) => <span key={h} className="pb-0.5 text-center text-[0.7rem] text-muted-foreground">{hourLabel(h)}</span>)}
              {week.days.map((d) => (
                <div key={d} className="contents">
                  <span className="flex items-center text-xs font-semibold">{DAY_NAMES[d - 1]}</span>
                  {week.hours.map((h) => {
                    const c = week.cell(d, h);
                    const thin = !c || c.calls < MIN_CALLS;
                    const r = thin ? null : rateOf(c, mode);
                    const step = thin ? null : Math.min(5, Math.floor(((r - lo) / (hi - lo || 1)) * 5.999));
                    return (
                      <button key={h} type="button" data-best-cell={`${d}-${h}`} data-thin={thin ? "" : undefined}
                        aria-label={`${DAY_NAMES[d - 1]} ${hourSpan(h)}: ${c?.calls ?? 0} calls, ${c?.leads ?? 0} leads, ${c?.appts ?? 0} appointments`}
                        onMouseEnter={(e) => setTip({ c: c ?? { dow: d, hour: h, calls: 0, leads: 0, appts: 0 }, x: e.currentTarget.getBoundingClientRect() })}
                        onFocus={(e) => setTip({ c: c ?? { dow: d, hour: h, calls: 0, leads: 0, appts: 0 }, x: e.currentTarget.getBoundingClientRect() })}
                        onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}
                        className={cn("flex h-10 items-center justify-center rounded-md text-[0.7rem] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                          thin ? "bg-[repeating-linear-gradient(45deg,var(--muted)_0_4px,transparent_4px_8px)] font-normal text-muted-foreground" : step >= 3 ? "text-primary-foreground" : "text-foreground")}
                        style={thin ? undefined : { background: `color-mix(in srgb, var(--primary) ${STEPS[step]}%, transparent)` }}>
                        {thin ? (c?.calls ? "·" : "") : pct(r)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">Lower
                <span className="inline-flex gap-0.5">{STEPS.map((s) => <i key={s} className="block h-2.5 w-5 rounded-sm" style={{ background: `color-mix(in srgb, var(--primary) ${s}%, transparent)` }} />)}</span>
                Higher</span>
              <span className="flex items-center gap-1.5"><i className="block h-2.5 w-5 rounded-sm bg-[repeating-linear-gradient(45deg,var(--muted)_0_4px,transparent_4px_8px)]" /> Fewer than {MIN_CALLS} calls: not enough to judge</span>
            </div>
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-muted-foreground">No calls in these days with these filters.</p>
        )}
      </section>

      {tip ? (
        <div className="pointer-events-none fixed z-50 min-w-48 rounded-lg border border-[var(--panel-border)] bg-popover px-3 py-2 text-xs shadow-xl"
          style={{ left: Math.max(8, tip.x.left + tip.x.width / 2 - 100), top: Math.max(8, tip.x.top - 86) }} data-best-tip>
          <b className="block text-sm">{DAY_NAMES[tip.c.dow - 1]} {hourSpan(tip.c.hour)}</b>
          {tip.c.calls.toLocaleString()} calls · {tip.c.leads} leads · {tip.c.appts} appointments
          <span className="block text-muted-foreground">{tip.c.calls < MIN_CALLS ? "Too few calls to judge" : `${pct(rateOf(tip.c, mode))} ${what}`}</span>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-[var(--panel-border)] bg-card" data-best-windows>
          <p className="border-b border-[var(--panel-border)] px-5 py-3 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Best hours</p>
          {best.length ? <ol className="py-1">{best.map((c, i) => line(c, i, "text-emerald-600 dark:text-emerald-400"))}</ol>
            : <p className="px-5 py-4 text-sm text-muted-foreground">Not enough calls yet: an hour needs {MIN_CALLS}.</p>}
        </section>
        <section className="rounded-xl border border-[var(--panel-border)] bg-card" data-worst-windows>
          <p className="border-b border-[var(--panel-border)] px-5 py-3 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Worst hours</p>
          {worst.length ? <ol className="py-1">{worst.map((c, i) => line(c, i, "text-rose-600 dark:text-rose-400"))}</ol>
            : <p className="px-5 py-4 text-sm text-muted-foreground">Not enough calls yet.</p>}
        </section>
      </div>

      <section className="rounded-xl border border-[var(--panel-border)] bg-card" data-best-breakdown={by}>
        <p className="border-b border-[var(--panel-border)] px-5 py-3 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Best two hours on weekdays, by {BY_PHRASE[by]}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-5 py-2">{BY_TITLE[by]}</th><th className="px-5 py-2">Best two hours</th><th className="px-5 py-2 text-right">Calls</th><th className="px-5 py-2 text-right">Conversion</th><th className="px-5 py-2 text-right">Overall</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const span = bestSpan(g.week, mode);
                return (
                  <tr key={g.dim ?? "none"} className="border-t border-[var(--panel-border)]" data-best-group={g.dim}>
                    <td className="px-5 py-2.5"><span className="font-medium">{g.label && g.label !== g.dim ? `${g.dim} · ${g.label}` : g.dim === "—" ? "Not given" : g.dim}</span></td>
                    <td className="px-5 py-2.5">{span ? `Mon–Fri, ${hourSpan(span.hour, 2)}` : <span className="text-muted-foreground">Not enough calls yet</span>}</td>
                    <td className="px-5 py-2.5 text-right">{g.week.total.calls.toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{span ? pct(span.rate) : "—"}</td>
                    <td className="px-5 py-2.5 text-right text-muted-foreground">{pct(rateOf(g.week.total, mode))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {groups.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No calls in these days with these filters.</p> : null}
        </div>
      </section>
    </div>
  );
}
