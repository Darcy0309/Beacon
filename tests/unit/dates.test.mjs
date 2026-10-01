#!/usr/bin/env node
/** Unit tests for the calendar's date helpers: arithmetic, the month grid, formatting, and reading typed dates. */
import {
  addDays, addMonths, clampIso, daysBetween, formatIso, formatRange, fromIso, isIsoDate, makeIso,
  monthEnd, monthGrid, parseTypedDate, relativeDay, todayIso, weekdayOf,
} from "../../src/lib/dates.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// --- dates as strings -------------------------------------------------------
is("a real date reads", isIsoDate("2026-10-01"), true);
is("February 30 is not a date", isIsoDate("2026-02-30"), false);
is("leap day 2028 is", isIsoDate("2028-02-29"), true);
is("not the format", fromIso("10/01/2026"), null);
is("makeIso pads", makeIso(2026, 3, 5), "2026-03-05");
is("makeIso refuses April 31", makeIso(2026, 4, 31), null);

// --- arithmetic --------------------------------------------------------------
is("a day on, across a month", addDays("2026-09-30", 1), "2026-10-01");
is("a day back, across a year", addDays("2027-01-01", -1), "2026-12-31");
is("a month from Jan 31 is Feb's last day", addMonths("2026-01-31", 1), "2026-02-28");
is("a month back from Mar 31 in a leap year", addMonths("2028-03-31", -1), "2028-02-29");
is("twelve months on", addMonths("2026-10-01", 12), "2027-10-01");
is("Oct 1 2026 is a Thursday", weekdayOf("2026-10-01"), 4);
is("days between, both ways", `${daysBetween("2026-10-01", "2026-10-15")}/${daysBetween("2026-10-15", "2026-10-01")}`, "14/-14");
is("month end", monthEnd("2026-02-10"), "2026-02-28");
is("clamped up to the minimum", clampIso("2026-01-01", "2026-10-01", null), "2026-10-01");

// --- the month grid ----------------------------------------------------------
{
  const g = monthGrid("2026-10-17");
  check("six weeks of days", g.length === 42);
  is("starts on the Sunday before the 1st", g[0], "2026-09-27");
  check("every week starts on a Sunday", g.filter((_, i) => i % 7 === 0).every((d) => weekdayOf(d) === 0));
  check("holds the whole month", g.includes("2026-10-01") && g.includes("2026-10-31"));
  is("a month starting on Sunday starts the grid", monthGrid("2026-02-01")[0], "2026-02-01");
}

// --- formatting --------------------------------------------------------------
is("long", formatIso("2026-10-01"), "Thu, Oct 1, 2026");
is("full", formatIso("2026-10-01", "full"), "Thursday, October 1, 2026");
is("month", formatIso("2026-10-01", "month"), "October 2026");
is("no date, no text", formatIso(""), "");
is("a range in one year", formatRange("2026-09-01", "2026-10-01"), "Sep 1 – Oct 1, 2026");
is("a range across years", formatRange("2026-12-28", "2027-01-03"), "Dec 28, 2026 – Jan 3, 2027");
is("a one-day range", formatRange("2026-10-01", "2026-10-01"), "Oct 1, 2026");

const T = "2026-10-01"; // a Thursday
is("relative: today", relativeDay(T, T), "today");
is("relative: tomorrow", relativeDay("2026-10-02", T), "tomorrow");
is("relative: in 3 days", relativeDay("2026-10-04", T), "in 3 days");
is("relative: in 3 weeks", relativeDay("2026-10-22", T), "in 3 weeks");
is("relative: in 11 months", relativeDay("2027-09-01", T), "in 11 months");
is("relative: 2 days ago", relativeDay("2026-09-29", T), "2 days ago");
is("relative: a year, singular", relativeDay("2025-10-01", T), "12 months ago");
check("today is the viewer's calendar day", /^\d{4}-\d{2}-\d{2}$/.test(todayIso()));

// --- reading typed dates -----------------------------------------------------
const read = (text, opts) => parseTypedDate(text, { today: T, ...opts });
for (const [text, want] of [
  ["10/15/2026", "2026-10-15"], ["10/15/26", "2026-10-15"], ["10-15-2026", "2026-10-15"], ["10.15.2026", "2026-10-15"],
  ["2026-10-15", "2026-10-15"], ["Oct 15", "2026-10-15"], ["October 15 2026", "2026-10-15"], ["Oct 15, 2026", "2026-10-15"],
  ["15 Oct 2026", "2026-10-15"], ["oct. 15th", "2026-10-15"], ["Sept 3", "2026-09-03"],
  ["today", T], ["Tomorrow", "2026-10-02"], ["yesterday", "2026-09-30"],
  ["+3", "2026-10-04"], ["-2", "2026-09-29"], ["+2w", "2026-10-15"], ["+1m", "2026-11-01"], ["+1y", "2027-10-01"], ["in 3 days", "2026-10-04"],
  ["fri", "2026-10-02"], ["Friday", "2026-10-02"], ["thu", T], ["next thursday", "2026-10-08"], ["mon", "2026-10-05"], ["tues", "2026-10-06"],
]) is(`reads "${text}"`, read(text), want);
for (const text of ["", "13/40/2026", "2/30/2026", "soon", "marchy 3", "ma 3", "10/15/226", "frid ay"]) is(`refuses "${text}"`, read(text), null);
is("no year: this year by default", read("Jan 5"), "2026-01-05");
is("no year, future: next January", read("Jan 5", { future: true }), "2027-01-05");
is("no year, future: later this year stays", read("12/24", { future: true }), "2026-12-24");
is("no year, future: today counts", read("10/1", { future: true }), T);

console.log(failures ? `\n${failures} test(s) failed.\n` : "\nAll date tests passed.\n");
process.exit(failures ? 1 : 0);
