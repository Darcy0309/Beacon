/**
 * The value axis of the report charts (client, Nov 2026: "show the left side
 * legends", as their phone system's reports do): a round top and the ticks
 * up to it, and the figures written on it. Pure, for components and tests.
 */

/**
 * A value axis from 0 to a round number at or above `max`, in about `ticks`
 * steps of 1, 2 or 5 times a power of ten (2.5 only from 25 up, so counts
 * never tick at halves). Nothing to show still draws 0 to `ticks`.
 *
 *   niceScale(582)    → { top: 600, ticks: [0, 200, 400, 600] }
 *   niceScale(0)      → { top: 4, ticks: [0, 1, 2, 3, 4] }
 */
export function niceScale(max, ticks = 4) {
  const n = Math.max(1, Math.round(ticks));
  const m = Number.isFinite(Number(max)) ? Math.max(0, Number(max)) : 0;
  if (m <= n) return { top: n, ticks: Array.from({ length: n + 1 }, (_, i) => i) };
  const raw = m / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const steps = p >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
  const step = steps.map((k) => k * p).find((s) => s * n >= m) ?? 10 * p;
  const top = Math.ceil(m / step - 1e-9) * step;
  const count = Math.round(top / step);
  return { top, ticks: Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12))) };
}

/**
 * A tick's figure: in full under 10,000 (1,500), compact from there (25K,
 * 1.2M), one style for the whole axis (decided by its top). `prefix`: "$".
 */
export function tickLabel(value, top = value, prefix = "") {
  const v = Number(value) || 0;
  if (top < 10000) return `${prefix}${v.toLocaleString("en-US")}`;
  if (top < 1e6) return `${prefix}${trim(v / 1e3)}K`;
  return `${prefix}${trim(v / 1e6)}M`;
}

const trim = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/** The chart types a viewer can pick, in the menu's order. A pie only splits a whole: stacked charts. */
export const CHART_TYPES = [
  { key: "bar", label: "Bar" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
  { key: "pie", label: "Pie" },
];

export const chartTypes = (stacked) => CHART_TYPES.filter((t) => t.key !== "pie" || stacked).map((t) => t.key);
