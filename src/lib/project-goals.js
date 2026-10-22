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

const MONTH_DAYS = 365.25 / 12;

/**
 * The overall goal a monthly one makes (Sean, Oct 2026: 5 a month is 60 a year): the monthly goal
 * times the project's months (its start to its end), or twelve without both dates. Null without one.
 */
export function goalFromMonthly(perMonth, days) {
  const m = Number(perMonth);
  if (perMonth == null || perMonth === "" || !Number.isFinite(m) || m <= 0) return null;
  const months = days?.totalDays ? Math.max(1, Math.round(days.totalDays / MONTH_DAYS)) : 12;
  return m * months;
}

/**
 * A goal per month against how the project is doing: { perMonth, avg, months, thisMonth, status }
 * or null without one. `avg`: its average a month so far (what it has done over the months since it
 * started, a month at least, to one decimal); `status`: "on pace" when that average reaches the goal,
 * "behind" when not, null without a start date to count from. `thisMonth`: done this month, as given.
 */
export function monthlyPace({ perMonth, done, days, thisMonth = null }) {
  const m = Number(perMonth);
  if (perMonth == null || perMonth === "" || !Number.isFinite(m) || m <= 0) return null;
  const months = days?.daysPassed != null ? Math.max(1, days.daysPassed / MONTH_DAYS) : null;
  const avg = months ? Math.round(((Number(done) || 0) / months) * 10) / 10 : null;
  return { perMonth: m, avg, months, thisMonth, status: avg == null ? null : avg >= m ? "on pace" : "behind" };
}

/**
 * A project's two goals as its page and Project Goals show them: the overall goal (as set, or from
 * the monthly one) against what it has done, with the monthly goal's pace when there is one.
 * `raw`: the project row; `done`: { leads, appointments }; `month`: this month's { leads, appointments }.
 */
export function projectGoals({ raw, done, month = null, days }) {
  const one = (total, perMonth, n, thisMonth) => {
    const g = goalProgress({ goal: total ?? goalFromMonthly(perMonth, days), done: n, share: days.share });
    return g ? { ...g, month: monthlyPace({ perMonth, done: n, days, thisMonth }) } : null;
  };
  return {
    leads: one(raw.lead_goal, raw.lead_goal_month, done.leads, month?.leads ?? null),
    appts: one(raw.appt_goal, raw.appt_goal_month, done.appointments, month?.appointments ?? null),
  };
}
