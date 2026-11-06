/**
 * The Match Tool's report (Sean, Nov 2026), from match_summary()'s rows and project_matches()'s:
 * each project's leads against its goal, how far behind its Due Date it runs, its matches by
 * renewal month, which to bring in, and the report as a CSV. Pure, so the pages and the tests share it.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayNumber = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);

/**
 * The renewal months from `today`'s on, as they come round: this month, the next eleven, and this
 * month next year (the days of it already gone renew then), each by its month and year:
 * [{ key: "2026-11", label: "Nov" }, …, { key: "2027-11", label: "Nov '27" }]. A label carries its
 * year only when the month is shown twice.
 */
export function monthsAhead(today) {
  const y = Number(today.slice(0, 4));
  const m0 = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: 13 }, (_, i) => {
    const year = y + Math.floor((m0 + i) / 12);
    const month = ((m0 + i) % 12) + 1;
    return { key: `${year}-${String(month).padStart(2, "0")}`, month, label: i === 12 ? `${MONTHS[month - 1]} '${String(year).slice(2)}` : MONTHS[month - 1] };
  });
}

/** A project's figures: the leads still owed, the share of the goal done (Sean: done, not owed), and days behind. */
export function goalFigures({ goal, leads, start, due, today }) {
  const g = Number(goal) || 0;
  const n = Number(leads) || 0;
  return { owed: g ? g - n : null, pct: g ? Math.round((n / g) * 100) : null, behind: daysBehind({ goal: g, leads: n, start, due, today }) };
}

/**
 * Days behind the pace that meets the goal by the Due Date: the leads short of where an even
 * pace would have them today, in days of that pace; 0 when on pace or ahead, null without a
 * goal, a start date or a Due Date to judge by.
 */
export function daysBehind({ goal, leads, start, due, today }) {
  if (!goal || !start || !due || due < start) return null;
  const total = dayNumber(due) - dayNumber(start) + 1;
  const passed = Math.min(total, Math.max(0, dayNumber(today) - dayNumber(start) + 1));
  const perDay = goal / total;
  const short = perDay * passed - (Number(leads) || 0);
  return short <= 0 ? 0 : Math.round(short / perDay);
}

/** The matches to bring in: those renewing in the months picked ("2026-12"; all when none), soonest first, `n` of them at most. */
export function pickMatches(matches, months = [], n = Infinity) {
  const want = new Set(months.map(String));
  return (matches ?? [])
    .filter((m) => !want.size || want.has(String(m.renewal).slice(0, 7)))
    .sort((a, b) => String(a.renewal).localeCompare(String(b.renewal)) || String(a.company).localeCompare(String(b.company)))
    .slice(0, Math.max(0, n));
}

/** How many matches renew each month and year: { "2027-03": 12, "2026-12": 4 }. */
export function byRenewalMonth(matches) {
  const out = {};
  for (const m of matches ?? []) {
    const k = String(m.renewal ?? "").slice(0, 7);
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const us = (d) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : "");

/** The report as a CSV, the columns of the old system's. */
export function matchReportCsv(rows, today) {
  const head = ["Client Name", "ProjectName", "ProjectStatus", "ProjectGoal", "ActualLeads", "LeadsOwed", "%Complete", "LeadMatches",
    "DevelopedLeadsSinceStart", "TotalMatchesAddedSinceStart", "StartDate", "DueDate", "DaysBehind"];
  const line = (r) => {
    const f = goalFigures({ goal: r.lead_goal, leads: r.leads, start: r.start_date, due: r.due_date, today });
    return [r.client, r.project, r.status, r.lead_goal ?? "", r.leads, f.owed ?? "", f.pct == null ? "" : `${f.pct}%`, r.matches,
      r.developed, r.matched, us(r.start_date), us(r.due_date), f.behind ?? ""];
  };
  return [head, ...(rows ?? []).map(line)].map((r) => r.map(cell).join(",")).join("\r\n");
}
