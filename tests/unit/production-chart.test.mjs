#!/usr/bin/env node
/** Unit tests for the administrator's production chart: ranges, points, per-hour figures and goals. */
import { axisMax, chartPoints, chartRange, chartStats, goalFrom, workdaysBetween } from "../../src/lib/production-chart.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// --- ranges (Mon Oct 12, 2026) ----------------------------------------------------
const today = "2026-10-12";
is("1D is today", chartRange("1D", today), { key: "1D", from: today, to: today });
is("5D is five working days, as a market's", chartRange("5D", today).from, "2026-10-06");
is("1W and 2W", [chartRange("1W", today).from, chartRange("2W", today).from], ["2026-10-06", "2026-09-29"]);
is("1M, 3M, YTD", [chartRange("1M", today).from, chartRange("3M", today).from, chartRange("YTD", today).from], ["2026-09-13", "2026-07-13", "2026-01-01"]);
is("a custom range, never past today", chartRange("custom", today, { from: "2026-09-01", to: "2026-12-31" }), { key: "custom", from: "2026-09-01", to: today });
is("…anything else is 1D", chartRange("nonsense", today).key, "1D");
is("working days in September 2026", workdaysBetween("2026-09-01", "2026-09-30"), 22);

// --- one day, by the hour --------------------------------------------------------
const goals = { "2026-10-01": { leads: 1320, appts: 880 } };
const day = { days: [{ day: today, leads: 4, appts: 2, lead_minutes: 120, appt_minutes: 60 }], hours: [{ hour: 4, leads: 1, appts: 0 }, { hour: 9, leads: 2, appts: 1 }, { hour: 20, leads: 1, appts: 1 }] };
const pts = chartPoints(day, chartRange("1D", today), goals);
is("5 AM to 6 PM, a running total (before open counts at open, after close at close)",
  [pts[0].label, pts.at(-1).label, pts[0].leads, pts.find((p) => p.hour === 9).leads, pts.at(-1).leads, pts.at(-1).appts], ["5 AM", "6 PM", 1, 3, 4, 2]);
is("…the day's goal: the month's spread over its 22 working days", Math.round(pts[0].goalLeads), 60);
const s = chartStats(day, chartRange("1D", today), goals, { leads: 3, appts: 2 });
is("leads per hour worked by lead managers, appointments per hour by appointment managers", [s.leads.perHour, s.appts.perHour], [2, 2]);
is("…high and low an hour, the day's total, and the share of the day's goal", [s.leads.high, s.leads.low, s.leads.total, s.leads.goal, s.leads.ofGoal, s.per], [2, 0, 4, 60, 7, "hour"]);

// --- ranges by the day, and by the week ----------------------------------------
const span = { days: [{ day: "2026-10-05", leads: 10, appts: 3, lead_minutes: 300, appt_minutes: 90 }, { day: "2026-10-12", leads: 20, appts: 5, lead_minutes: 420, appt_minutes: 150 }] };
const w = chartPoints(span, chartRange("1W", today), goals);
is("a week by the day", [w.length, w[0].label, w.at(-1).leads], [7, "Oct 6", 20]);
const st = chartStats(span, chartRange("2W", today), goals, {});
is("…per day: high, low, average; and per hour over the period", [st.leads.high, st.leads.low, st.leads.average.toFixed(2), st.leads.perHour.toFixed(2), st.per], [20, 0, "2.14", "2.50", "day"]);
const y = chartPoints(span, chartRange("YTD", today), goals);
check("beyond three months, by the week (Monday to Sunday)", y.every((p) => p.title.startsWith("Week of")) && y.at(-1).leads === 20 && y.at(-2).leads === 10, JSON.stringify(y.slice(-2)));
is("goals only where a month has one", [y[0].goalLeads, y.at(-1).goalLeads != null], [null, true]);

// --- goals ---------------------------------------------------------------------
is("5 lead managers × 4 hours × 21 days × 3 an hour = 1,260 leads", goalFrom({ people: 5, hoursPerDay: 4, days: 21, perHour: 3 }), 1260);
is("the axis: 100 for a day, rounded up beyond", [axisMax(37, 100), axisMax(130, 100), axisMax(7)], [100, 200, 10]);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll production chart checks passed.");
