// Best Times to Call (Sean and Darcy, Nov 2026): when calls turn into leads and appointments, by day and hour in the
// business's local time. Pure, so the report and the tests share it; the counts come from best_times().

/** An hour with fewer calls than this is greyed out and left out of best and worst: one lucky hour shouldn't count. */
export const MIN_CALLS = 20;

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** What a square measures: leads, appointments, or either. */
export const MODES = [["both", "Both"], ["leads", "Leads"], ["appts", "Appointments"]];

/** A count's conversion for `mode`, 0–1 (null with no calls). */
export function rateOf(c, mode = "both") {
  if (!c?.calls) return null;
  const won = mode === "leads" ? c.leads : mode === "appts" ? c.appts : c.leads + c.appts;
  return won / c.calls;
}

/** "9–10 AM", "11 AM–12 PM", "12–1 PM". */
export function hourSpan(h, length = 1) {
  const label = (x) => `${((x + 11) % 12) + 1}`;
  const half = (x) => (x % 24 < 12 ? "AM" : "PM");
  const end = h + length;
  return half(h) === half(end) ? `${label(h)}–${label(end)} ${half(end)}` : `${label(h)} ${half(h)}–${label(end)} ${half(end)}`;
}

/** "7a", "12p". */
export const hourLabel = (h) => `${((h + 11) % 12) + 1}${h % 24 < 12 ? "a" : "p"}`;

/**
 * Rows of best_times() (one breakdown's, or all) as a week: { days (1–7 with calls, Mon–Fri always), hours (the span
 * called in, 7 AM–6 PM at least), cell(dow, hour) → { calls, leads, appts } | null, total }.
 */
export function weekOf(rows) {
  const map = new Map();
  const total = { calls: 0, leads: 0, appts: 0 };
  for (const r of rows ?? []) {
    const key = `${r.dow}-${r.hour}`;
    const c = map.get(key) ?? { dow: Number(r.dow), hour: Number(r.hour), calls: 0, leads: 0, appts: 0 };
    c.calls += Number(r.calls); c.leads += Number(r.leads); c.appts += Number(r.appts);
    map.set(key, c);
    total.calls += Number(r.calls); total.leads += Number(r.leads); total.appts += Number(r.appts);
  }
  const cells = [...map.values()];
  const days = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => cells.some((c) => c.dow === d))];
  const called = cells.map((c) => c.hour);
  const from = Math.min(7, ...called);
  const to = Math.max(18, ...called);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return { days, hours, cells, cell: (dow, hour) => map.get(`${dow}-${hour}`) ?? null, total };
}

/** The best and worst hours of a week (each with MIN_CALLS calls or more), `n` of each, for `mode`. */
export function windows(week, mode = "both", n = 3) {
  const judged = week.cells.filter((c) => c.calls >= MIN_CALLS).map((c) => ({ ...c, rate: rateOf(c, mode) }));
  const sorted = [...judged].sort((a, b) => b.rate - a.rate || b.calls - a.calls);
  // Few hours to judge: the better half best, the rest worst, so an hour is never in both lists.
  const top = Math.min(n, Math.ceil(sorted.length / 2));
  return { best: sorted.slice(0, top), worst: sorted.slice(top).slice(-n).reverse() };
}

/**
 * A breakdown's best two hours on weekdays (Monday to Friday together), for `mode`: { hour, calls, rate } or null
 * when no two-hour span, both hours called in, has MIN_CALLS calls.
 */
export function bestSpan(week, mode = "both") {
  let best = null;
  for (const h of week.hours) {
    const sum = { calls: 0, leads: 0, appts: 0 };
    const each = [0, 0];
    for (const d of [1, 2, 3, 4, 5]) [h, h + 1].forEach((x, i) => {
      const c = week.cell(d, x);
      if (c) { sum.calls += c.calls; sum.leads += c.leads; sum.appts += c.appts; each[i] += c.calls; }
    });
    // Both hours called in, and enough calls between them to judge.
    if (!each[0] || !each[1] || sum.calls < MIN_CALLS) continue;
    const rate = rateOf(sum, mode);
    if (!best || rate > best.rate) best = { hour: h, calls: sum.calls, rate };
  }
  return best;
}

/** A rate as "9.7%"; "—" for none. */
export const pct = (r) => (r == null ? "—" : `${(r * 100).toFixed(1)}%`);
