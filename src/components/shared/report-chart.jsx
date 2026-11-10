"use client";

import { useSyncExternalStore } from "react";
import Link from "@/components/shared/intent-link";
import TipLayer from "@/components/shared/tip-layer";
import { niceScale, tickLabel } from "@/lib/chart-scale";
import { cn } from "@/lib/utils";

const fmt = (n) => Number(n ?? 0).toLocaleString("en-US");
const PICKS = new Set(["bar", "line", "area"]);

// The chart type picked under Appearance (lib/appearance.js), on <html data-chart-type>: none on
// the server, or until it is picked (each chart its own); a new pick redraws every chart at once.
const watch = (onChange) => {
  const o = new MutationObserver(onChange);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-chart-type"] });
  return () => o.disconnect();
};
const useChartPick = () => useSyncExternalStore(watch, () => document.documentElement.dataset.chartType ?? null, () => null);

/**
 * The report charts (client, Nov 2026, after their phone system's reports):
 * a value axis on the left with round figures and hairline gridlines, the
 * figures as bars, a line or an area. Which one is each person's own pick,
 * under Appearance (the theme button), for every chart at once; without one,
 * each chart's own (`defaultType`).
 *
 *   id        names the chart (data-report-chart)
 *   points    [{ key, label, title?, values: { [series]: n }, href?: { [series]: url },
 *               segLabel?: { [series]: aria-label }, selected?: series, current?, faded?, attrs? }]
 *             attrs go on the point's column (data-month-column, role, aria-label…)
 *   series    [{ key, label, color }], bottom to top in a stack
 *   stacked   the series split each point's whole (stacked bars, a stacked area)
 *   tips      TipLayer tips by point key (made from the values without)
 *   legendExtra  more beside the legend ("Total 1,541")
 *   variant   "full", or "tile": a stat tile's chart (no legend or month names, three figures up the axis)
 *   height    classes sizing the plot and its labels ("h-60", "min-h-56 flex-1")
 *   prefix    before the axis figures ("$")
 * Anything else (data-months-chart…) goes on the plot, the element the tooltips belong to.
 */
export default function ReportChart({
  id, points, series, stacked = false, defaultType = "bar", tips, legendExtra, variant = "full",
  height = "h-60", prefix = "", className, ...rest
}) {
  const tile = variant === "tile";
  const pick = useChartPick();
  const type = PICKS.has(pick) ? pick : PICKS.has(defaultType) ? defaultType : "bar";
  const total = (p) => series.reduce((n, s) => n + (Number(p.values[s.key]) || 0), 0);
  // Stacked bars and areas reach each point's whole; lines (and side-by-side bars) their own figures.
  const sums = stacked && type !== "line";
  const top = Math.max(0, ...points.map((p) => (sums ? total(p) : Math.max(0, ...series.map((s) => Number(p.values[s.key]) || 0)))));
  const scale = niceScale(top, tile ? 2 : 4);
  const pct = (v) => (Math.max(0, Number(v) || 0) / scale.top) * 100;
  const labels = !tile;

  const shownTips = tips ?? Object.fromEntries(points.map((p) => [p.key, {
    title: p.title ?? p.label,
    rows: series.map((s) => ({ key: s.key, label: s.label, color: s.color, value: fmt(p.values[s.key]) })),
    total: stacked ? fmt(total(p)) : undefined,
  }]));

  const legend = tile || (series.length < 2 && !legendExtra) ? null : (
    <div className="mb-3 flex items-center gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground" data-chart-legend>
        {series.length > 1 ? (stacked ? [...series].reverse() : series).map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
        )) : null}
        {legendExtra}
      </div>
    </div>
  );

  return (
    <div className={cn("flex flex-col", className)} data-report-chart={id} data-chart-shown={type}>
      {legend}
      {/* pt: the top figure is centred on its gridline, half of it above the plot. */}
      <div className={cn("flex min-h-0 gap-1.5 pt-1.5", height)}>
        <div aria-hidden className={cn("relative shrink-0", tile ? "w-7" : "w-9")} data-chart-axis>
          <div className={cn("absolute inset-x-0 top-0", labels ? "bottom-6" : "bottom-0")}>
            {scale.ticks.map((t) => (
              <span key={t} data-axis-tick={t} className="absolute right-0 translate-y-1/2 text-[10px] leading-none tabular-nums text-muted-foreground"
                style={{ bottom: `${pct(t)}%` }}>
                {tickLabel(t, scale.top, prefix)}
              </span>
            ))}
          </div>
        </div>
        <TipLayer tips={shownTips} className="relative flex min-w-0 flex-1 items-stretch" {...rest}>
          <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0", labels ? "bottom-6" : "bottom-0")}>
            {scale.ticks.map((t) => (
              <span key={t} className="absolute inset-x-0 h-px bg-[var(--panel-border)]" style={{ bottom: `${pct(t)}%` }} />
            ))}
          </div>
          {type !== "bar" ? <Lines points={points} series={series} stacked={stacked && type === "area"} area={type === "area"} pct={pct} labels={labels} /> : null}
          {points.map((p, i) => (
            <div key={p.key} data-tip={p.key} {...p.attrs}
              className={cn("relative flex min-w-0 flex-1 flex-col items-center gap-2 px-[3px] transition-opacity sm:px-1.5 group/col", p.faded && "opacity-25")}>
              <div className="relative flex min-h-0 w-full flex-1 items-end justify-center gap-1 rounded-t transition-colors group-hover/col:bg-foreground/[0.04]">
                {type === "bar"
                  ? (stacked ? <Stack p={p} i={i} series={series} total={total(p)} pct={pct} /> : <Bars p={p} i={i} series={series} pct={pct} tile={tile} />)
                  : <Dots p={p} series={series} stacked={stacked && type === "area"} pct={pct} />}
              </div>
              {labels ? (
                <span className={cn("h-4 max-w-full truncate text-[0.62rem] font-semibold uppercase leading-4 tracking-[0.08em] sm:text-[0.66rem]",
                  p.current ? "text-primary" : "text-muted-foreground")}>
                  {p.label}
                </span>
              ) : null}
            </div>
          ))}
        </TipLayer>
      </div>
    </div>
  );
}

/** One figure's mark: a link to the names behind it where there is one. */
function Mark({ p, s, className, style, anchor }) {
  const href = p.href?.[s.key];
  const common = {
    "data-seg": s.key,
    "data-tip-row": s.key,
    "data-tip-anchor": anchor ? "" : undefined,
    "aria-label": p.segLabel?.[s.key],
    style,
  };
  if (!href) return <span {...common} className={cn("block", className)} />;
  return (
    <Link href={href} {...common}
      className={cn("block transition-opacity hover:opacity-80", p.selected === s.key && "outline-2 -outline-offset-2 outline-foreground", className)} />
  );
}

/** Side-by-side bars, the tooltip pointing at the tallest. */
function Bars({ p, i, series, pct, tile }) {
  const tallest = series.reduce((a, s) => ((Number(p.values[s.key]) || 0) > (Number(p.values[a.key]) || 0) ? s : a), series[0]);
  return series.map((s, j) => {
    const v = Number(p.values[s.key]) || 0;
    return (
      <Mark key={s.key} p={p} s={s} anchor={s.key === tallest.key}
        className={cn("animate-grow-height min-w-1 flex-1 rounded-t transition-[height] duration-500", tile ? "max-w-3.5" : "max-w-6")}
        style={{ height: `${pct(v)}%`, minHeight: v ? 2 : 0, background: s.color, animationDelay: `${i * 60 + j * 35}ms` }} />
    );
  });
}

/** One column of the series stacked, bottom first; a hairline between them. */
function Stack({ p, i, series, total, pct }) {
  if (!total) return <div data-tip-anchor className="h-0.5 w-full max-w-12 rounded bg-[var(--panel-border)]" />;
  return (
    <div data-tip-anchor className="animate-grow-height flex w-full max-w-12 flex-col-reverse gap-px overflow-hidden rounded-t-md transition-[height] duration-500"
      style={{ height: `${pct(total)}%`, animationDelay: `${i * 45}ms` }}>
      {series.map((s) => {
        const v = Number(p.values[s.key]) || 0;
        return v ? <Mark key={s.key} p={p} s={s} className="w-full" style={{ height: `${(v / total) * 100}%`, minHeight: 2, background: s.color }} /> : null;
      })}
    </div>
  );
}

/** A line or area's points: a dot on each figure (on the top of its band, stacked), the tooltip at the highest. */
function Dots({ p, series, stacked, pct }) {
  let run = 0;
  const at = series.map((s) => {
    const v = Number(p.values[s.key]) || 0;
    run += v;
    return { s, y: stacked ? run : v };
  });
  const high = at.reduce((a, d) => (d.y > a.y ? d : a), at[0]);
  return at.map(({ s, y }) => (
    <Mark key={s.key} p={p} s={s} anchor={s.key === high.s.key}
      className="absolute left-1/2 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-[var(--card)]"
      style={{ bottom: `${pct(y)}%`, background: s.color }} />
  ));
}

/** The lines (and areas) through the points' dots, drawn under them, across the plot. */
function Lines({ points, series, stacked, area, pct, labels }) {
  const n = points.length;
  const x = (i) => ((i + 0.5) / Math.max(1, n)) * 100;
  const y = (v) => 100 - pct(v);
  const lower = points.map(() => 0);
  const shapes = series.map((s) => {
    const base = [...lower];
    const vals = points.map((p, i) => (stacked ? base[i] : 0) + (Number(p.values[s.key]) || 0));
    if (stacked) vals.forEach((v, i) => (lower[i] = v));
    const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
    const floor = stacked ? base : points.map(() => 0);
    const fill = `${line}${floor.map((_, k) => { const i = n - 1 - k; return `L${x(i).toFixed(2)},${y(floor[i]).toFixed(2)}`; }).join("")}Z`;
    return { s, line, fill };
  });
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" data-chart-lines
      className={cn("pointer-events-none absolute inset-x-0 top-0 w-full overflow-visible", labels ? "h-[calc(100%-1.5rem)]" : "h-full")}>
      <g className="animate-rise">
        {area ? shapes.map(({ s, fill }) => <path key={`f-${s.key}`} d={fill} fill={s.color} fillOpacity={stacked ? 0.28 : 0.12} />) : null}
        {shapes.map(({ s, line }) => (
          <path key={s.key} d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
