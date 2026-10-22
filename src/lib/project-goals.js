/**
 * A project against its goals (the old project dashboard and backfill
 * report): how far through its dates it is, how many it has delivered of
 * its goal, how many it still owes (or has given over), and whether it is
 * keeping pace. Days are "YYYY-MM-DD".
 */

const dayNumber = (iso) => Math.round(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / 86400000);

/** Through its dates: { daysPassed, daysLeft, totalDays, share (0 to 1) }, each null without the dates it needs. */
export function projectDays({ start, end, today }) {
  const t = dayNumber(today);
  const s = start ? dayNumber(start) : null;
  const e = end ? dayNumber(end) : null;
  const totalDays = s != null && e != null && e >= s ? e - s + 1 : null;
  const daysPassed = s != null ? Math.max(0, Math.min(t - s + 1, totalDays ?? Infinity)) : null;
  const daysLeft = e != null ? Math.max(0, e - t) : null;
  return { daysPassed, daysLeft, totalDays, share: totalDays ? Math.min(1, daysPassed / totalDays) : null };
}

/**
 * One goal: { goal, done, pct, owed, extra, expected, status } or null with no goal.
 *   expected  where the goal would have it by today, through its dates evenly
 *   status    "met" | "on pace" | "behind" | null (no dates to judge by)
 */
export function goalProgress({ goal, done, share }) {
  const g = Number(goal);
  if (goal == null || goal === "" || !Number.isFinite(g) || g <= 0) return null;
  const d = Number(done) || 0;
  const expected = share == null ? null : Math.round(g * share);
  const status = d >= g ? "met" : expected == null ? null : d >= expected ? "on pace" : "behind";
  return { goal: g, done: d, pct: Math.round((d / g) * 100), owed: Math.max(0, g - d), extra: Math.max(0, d - g), expected, status };
}
