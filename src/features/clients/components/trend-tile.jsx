"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import Link from "@/components/shared/intent-link";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRange } from "@/lib/dates";
import { CHART_RANGES, DAY_AXIS, axisMax, chartPoints } from "@/lib/production-chart";
import { cn } from "@/lib/utils";

const HEIGHT = 132;
const PAD = { left: 30, right: 10, top: 10, bottom: 20 };
const RANGES = CHART_RANGES.filter((r) => r.key !== "custom");
const fmt = (n) => Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * A figure in a tile with its chart over time, stock-chart style like the
 * dashboard's: a day by the hour (its running total), up to three months by
 * the day, beyond by the week, over a range chosen on the tile (1D to two
 * years; kept in the address as `param`). For the Clients page's Leads and
 * Appointments.
 *
 *   value, note   the figure and what it counts
 *   data          { days, hours } (clients_chart()); series "leads" | "appts"
 *   range         chartRange(); params the page's own, for the range links
 *   developed     the words for the range's total ("developed", "set")
 */
export default function TrendTile({ label, value, note, icon, accent, data, series, range, param, params = {}, developed = "developed", className, style }) {
  const [width, setWidth] = useState(360);
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(220, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const oneDay = range.from === range.to;
  const points = useMemo(() => chartPoints(data, range, {}), [data, range]);
  // A day's points are its running total; a range's are each day's or week's own.
  const total = oneDay ? points.at(-1)?.[series] ?? 0 : points.reduce((n, p) => n + (p[series] ?? 0), 0);
  const max = axisMax(Math.max(0, ...points.map((p) => p[series] ?? 0)), oneDay ? Math.min(DAY_AXIS, 10) : 4);
  const w = width - PAD.left - PAD.right;
  const h = HEIGHT - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * w : w / 2);
  const y = (v) => PAD.top + h - (v / max) * h;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[series] ?? 0).toFixed(1)}`).join("");
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    setHover(Math.min(points.length - 1, Math.max(0, Math.round(((px - PAD.left) / Math.max(w, 1)) * (points.length - 1)))));
  };
  const href = (key) => {
    const q = new URLSearchParams(params);
    if (key === "1M") q.delete(param);
    else q.set(param, key);
    const s = q.toString();
    return s ? `/clients?${s}` : "/clients";
  };
  const current = RANGES.find((r) => r.key === range.key) ?? RANGES[0];
  const chip = (on) => cn("rounded px-1.5 py-0.5 text-[0.62rem] font-bold tracking-[0.04em] transition-colors", on ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground");

  return (
    <div data-panel data-accent-edge="" data-trend-tile={series}
      className={cn("group relative flex flex-col overflow-hidden rounded-xl transition-colors duration-200", className)}
      style={{ "--edge": accent, ...style }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${accent} 16%, transparent), transparent 62%)` }} />
      <div className="relative flex flex-1 flex-col p-4 pb-2">
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border"
            style={{ borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`, background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
            {icon}
          </span>
          <span className="stat-label min-w-0 flex-1 pt-0.5" style={{ color: `color-mix(in srgb, ${accent} 68%, var(--foreground))` }}>{label}</span>
        </div>
        <div className="mt-3 stat-value" style={{ color: accent }} data-trend-value>{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground" title={note}>{note}</div>
        {/* What the chart adds up to, on a line of its own so two tiles side by side stay level. */}
        <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums" data-trend-total>
          <strong className="text-foreground">{fmt(total)}</strong> {developed} · {oneDay ? `${formatRange(range.from, range.to)}, by the hour` : formatRange(range.from, range.to)}
        </div>

        {/* The range, as on a stock chart. */}
        <nav className="mt-2 flex flex-wrap items-center gap-px" aria-label={`${label} range`} data-trend-ranges>
          {RANGES.filter((r) => !r.more).map((r) => (
            <Link key={r.key} href={href(r.key)} scroll={false} aria-current={range.key === r.key ? "true" : undefined} className={chip(range.key === r.key)}>{r.label}</Link>
          ))}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn(chip(Boolean(current.more)), "flex items-center gap-0.5")} data-trend-more>
                {current.more ? current.label : "More"} <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {RANGES.filter((r) => r.more).map((r) => (
                <DropdownMenuItem key={r.key} asChild><Link href={href(r.key)} scroll={false}>{r.label}</Link></DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div ref={box} className="relative mt-1 flex-1" data-trend-chart>
          <svg width={width} height={HEIGHT} className="block" role="img" aria-label={`${label}: ${fmt(total)} ${developed}, ${formatRange(range.from, range.to)}`}
            onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(max * t)} y2={y(max * t)} stroke="var(--panel-border)" strokeDasharray={t ? "2 4" : undefined} />
                <text x={PAD.left - 5} y={y(max * t) + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular-nums">{fmt(max * t)}</text>
              </g>
            ))}
            <text x={PAD.left} y={HEIGHT - 5} textAnchor="start" className="fill-muted-foreground text-[9px]">{points[0]?.label}</text>
            {points.length > 1 ? <text x={width - PAD.right} y={HEIGHT - 5} textAnchor="end" className="fill-muted-foreground text-[9px]">{points.at(-1).label}</text> : null}
            {points.length > 1 ? <path d={`${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={accent} fillOpacity="0.12" /> : null}
            <path d={line} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" data-trend-line />
            {points.length ? <circle cx={x(points.length - 1)} cy={y(points.at(-1)[series] ?? 0)} r="3" fill={accent} /> : null}
            {hover != null && points[hover] ? (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + h} stroke="var(--muted-foreground)" strokeOpacity="0.5" />
                <circle cx={x(hover)} cy={y(points[hover][series] ?? 0)} r="3.5" fill="var(--card)" stroke={accent} strokeWidth="2" />
              </g>
            ) : null}
          </svg>
          {hover != null && points[hover] ? (
            <div className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-[0.7rem] shadow-lg" data-trend-tip
              style={{ left: Math.min(Math.max(x(hover) - 50, 4), width - 120) }}>
              <span className="font-semibold">{points[hover].title}</span>: <strong className="tabular-nums">{fmt(points[hover][series])}</strong>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
