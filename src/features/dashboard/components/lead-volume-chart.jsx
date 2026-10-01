"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Activity } from "lucide-react";
import CountUp from "@/components/shared/count-up";
import SectionHeader from "@/components/shared/section-header";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "1m", label: "1M", title: "Last month", unit: "day" },
  { key: "2m", label: "2M", title: "Last 2 months", unit: "week" },
  { key: "6m", label: "6M", title: "Last 6 months", unit: "week" },
  { key: "1y", label: "1Y", title: "Last year", unit: "month" },
];
const DEFAULT_RANGE = "2m";
const STORE_KEY = "lighthouse:lead-volume-range";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HEIGHT = 220;
const PAD = { left: 40, right: 14, top: 14, bottom: 28 };
const RISE_MS = 900;

// Dates are UTC calendar days ("2026-09-29"), the same days the database groups by.
const dayKey = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const short = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;

/** Group daily counts into the buckets a range is drawn in, oldest first. */
function bucket(days, range) {
  const byDay = new Map(days.map((d) => [d.day, Number(d.leads) || 0]));
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sum = (from, to) => {
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) n += byDay.get(dayKey(d)) ?? 0;
    return n;
  };

  if (range === "1m") {
    return Array.from({ length: 30 }, (_, i) => {
      const d = addDays(today, i - 29);
      return { label: short(d), full: short(d), value: byDay.get(dayKey(d)) ?? 0 };
    });
  }
  if (range === "1y") {
    return Array.from({ length: 12 }, (_, i) => {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11 + i, 1));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
      const label = first.getUTCMonth() === 0 ? `${MONTHS[0]} ${first.getUTCFullYear()}` : MONTHS[first.getUTCMonth()];
      return { label, full: `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}`, value: sum(first, last < today ? last : today) };
    });
  }
  const weeks = range === "2m" ? 9 : 26;
  return Array.from({ length: weeks }, (_, i) => {
    const end = addDays(today, -7 * (weeks - 1 - i));
    const start = addDays(end, -6);
    return { label: short(start), full: `Week of ${short(start)}`, value: sum(start, end) };
  });
}

/** A round top for the value axis: 1, 2 or 5 times a power of ten. */
function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * 0 to 1, eased, over RISE_MS each time `key` changes; at once when the
 * system asks for less motion. Until its first frame a new key reads 0, so
 * a new period never flashes up at full height first.
 */
function useRise(key) {
  const [state, setState] = useState({ key: null, t: 0 });
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const began = performance.now();
    let frame;
    const step = (now) => {
      // A frame's timestamp can be a little before `began`: never below 0.
      const k = still ? 1 : Math.min(1, Math.max(0, (now - began) / RISE_MS));
      setState({ key, t: 1 - (1 - k) ** 3 });
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key]);
  return state.key === key ? state.t : 0;
}

/**
 * New leads over a chosen period: the last month by day, two or six months
 * by week, or a year by month. Drawn at its real width (nothing stretched),
 * with a value axis, a hover readout, and the line rising from zero.
 * The chosen period is remembered on this browser.
 *
 * `days` comes from lead_volume_daily(); `fallback` (the old eight weekly
 * buckets) is drawn instead if that function is not available yet.
 */
export default function LeadVolumeChart({ days, fallback }) {
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORE_KEY);
      if (RANGES.some((r) => r.key === saved)) setRange(saved);
    } catch {
      // Private browsing or storage turned off: keep the default.
    }
  }, []);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const choose = (key) => {
    setRange(key);
    setHover(null);
    try {
      window.localStorage.setItem(STORE_KEY, key);
    } catch {
      // Not remembered; the choice still applies now.
    }
  };

  const meta = RANGES.find((r) => r.key === range);
  const points = useMemo(
    () => (days ? bucket(days, range) : (fallback ?? []).map((w) => ({ label: w.label, full: w.label, value: w.leads }))),
    [days, fallback, range]
  );
  const total = points.reduce((s, p) => s + p.value, 0);
  const peak = Math.max(0, ...points.map((p) => p.value));
  const avg = points.length ? Math.round(total / points.length) : 0;
  const top = niceMax(peak);
  const rise = useRise(range);

  const w = Math.max(width, 1);
  const innerW = Math.max(1, w - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (points.length > 1 ? (i * innerW) / (points.length - 1) : innerW / 2);
  const y = (v) => PAD.top + innerH - ((v * rise) / top) * innerH;
  const coords = points.map((p, i) => [x(i), y(p.value)]);
  const line = coords.length ? `M${coords.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" L")}` : "";
  const base = PAD.top + innerH;
  const area = coords.length ? `${line} L${coords.at(-1)[0].toFixed(1)},${base} L${coords[0][0].toFixed(1)},${base} Z` : "";

  // A label every 90px or so, always one on the latest point, none crowding it.
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 90))));
  const last = points.length - 1;
  const labelled = points.map((_, i) => i).filter((i) => i === last || (i % every === 0 && last - i >= every * 0.6));

  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const i = points.length > 1 ? Math.round(((px - PAD.left) / innerW) * (points.length - 1)) : 0;
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const unit = days ? meta.unit : "week";
  const title = days ? `Lead Volume — ${meta.title}` : "Lead Volume — Last 8 Weeks";

  return (
    <>
      <SectionHeader
        label={title}
        icon={Activity}
        action={
          days ? (
            <div role="group" aria-label="Period" className="flex rounded-md border border-[var(--panel-border)] p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => choose(r.key)}
                  aria-pressed={range === r.key}
                  title={r.title}
                  className={cn(
                    "cursor-pointer rounded px-2 py-0.5 text-[0.66rem] font-bold tracking-[0.08em] transition-colors",
                    range === r.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          ) : null
        }
      />
      <div className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-4 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" /> Leads / {unit}
          </span>
          <span>Total <CountUp value={total.toLocaleString()} /></span>
          <span>Peak <CountUp value={peak.toLocaleString()} /></span>
          <span>Avg <CountUp value={avg.toLocaleString()} /></span>
        </div>

        <div ref={boxRef} className="relative h-[220px] w-full">
          {width ? (
            <svg
              width={w}
              height={HEIGHT}
              viewBox={`0 0 ${w} ${HEIGHT}`}
              role="img"
              aria-label={`New leads per ${unit}, ${days ? meta.title.toLowerCase() : "last 8 weeks"}: ${total} in all, peak ${peak}`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              className="block touch-none"
            >
              <defs>
                <linearGradient id="lead-volume-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--primary)" stopOpacity="0.3" />
                  <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const gy = PAD.top + innerH - t * innerH;
                return (
                  <g key={t}>
                    <line x1={PAD.left} x2={w - PAD.right} y1={gy} y2={gy} stroke="var(--panel-border)" strokeWidth="1" />
                    <text x={PAD.left - 8} y={gy + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                      {Math.round(top * t).toLocaleString()}
                    </text>
                  </g>
                );
              })}
              <path d={area} fill="url(#lead-volume-fill)" />
              <path d={line} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {coords.length ? <circle cx={coords.at(-1)[0]} cy={coords.at(-1)[1]} r="4.5" className="fill-primary" /> : null}
              {labelled.map((i) => (
                <text
                  key={i}
                  x={x(i)}
                  y={HEIGHT - 8}
                  textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                  className="fill-muted-foreground"
                  style={{ fontSize: 10, letterSpacing: "0.04em" }}
                >
                  {points[i].label}
                </text>
              ))}
              {/* Hover readout: a guide down to the axis and the point it reads. */}
              {hover !== null && coords[hover] ? (
                <g pointerEvents="none">
                  <line x1={coords[hover][0]} x2={coords[hover][0]} y1={PAD.top} y2={base} stroke="var(--primary)" strokeOpacity="0.35" strokeDasharray="3 3" />
                  <circle cx={coords[hover][0]} cy={coords[hover][1]} r="4" className="fill-primary" stroke="var(--card)" strokeWidth="2" />
                </g>
              ) : null}
            </svg>
          ) : null}
          {hover !== null && coords[hover] ? (
            <div
              className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-[var(--panel-border)] bg-card px-2.5 py-1.5 text-xs shadow-lg"
              style={{ left: Math.min(Math.max(coords[hover][0], 70), w - 70), top: Math.max(0, coords[hover][1] - 52) }}
            >
              <div className="font-semibold tabular-nums">{points[hover].value.toLocaleString()} leads</div>
              <div className="text-muted-foreground">{points[hover].full}</div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
