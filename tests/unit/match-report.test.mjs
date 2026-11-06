#!/usr/bin/env node
/** Unit tests for the Match Tool's report (match-report.js; Sean, Nov 2026). */
import { byRenewalMonth, daysBehind, goalFigures, matchReportCsv, monthsAhead, monthsOfYear, pickMatches, renewingSoon } from "../../src/lib/match-report.js";

let failures = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failures++; }
};

is("renewal months from this one round to the same next year, each its month and year", monthsAhead("2026-11-05").map((m) => `${m.key} ${m.label}`),
  ["2026-11 Nov", "2026-12 Dec", "2027-01 Jan", "2027-02 Feb", "2027-03 Mar", "2027-04 Apr", "2027-05 May", "2027-06 Jun", "2027-07 Jul", "2027-08 Aug", "2027-09 Sep", "2027-10 Oct", "2027-11 Nov '27"]);
// 100 leads over 100 days (Jan 1 to Apr 10): a lead a day.
is("on pace: none behind", daysBehind({ goal: 100, leads: 50, start: "2026-01-01", due: "2026-04-10", today: "2026-02-19" }), 0);
is("…20 short of the pace on day 50: 20 days behind", daysBehind({ goal: 100, leads: 30, start: "2026-01-01", due: "2026-04-10", today: "2026-02-19" }), 20);
is("…ahead: none", daysBehind({ goal: 100, leads: 80, start: "2026-01-01", due: "2026-04-10", today: "2026-02-19" }), 0);
is("…past the Due Date: all that's short", daysBehind({ goal: 100, leads: 90, start: "2026-01-01", due: "2026-04-10", today: "2026-06-01" }), 10);
is("…no Due Date, start or goal: nothing to judge by", [daysBehind({ goal: 100, leads: 1, start: "2026-01-01", due: null, today: "2026-02-01" }),
  daysBehind({ goal: 0, leads: 1, start: "2026-01-01", due: "2026-04-10", today: "2026-02-01" })], [null, null]);
is("Sean's sample: 405 of 800 is 51% done, 395 owed", (({ owed, pct }) => [owed, pct])(goalFigures({ goal: 800, leads: 405, start: null, due: null, today: "2026-11-05" })), [395, 51]);
is("…past the goal: owed below zero, over 100%", (({ owed, pct }) => [owed, pct])(goalFigures({ goal: 200, leads: 270, today: "2026-11-05" })), [-70, 135]);
const matches = [
  { lead_id: 1, company: "B", renewal: "2027-02-10" }, { lead_id: 2, company: "A", renewal: "2026-12-01" },
  { lead_id: 3, company: "C", renewal: "2027-06-01" }, { lead_id: 4, company: "D", renewal: "2026-12-20" },
];
// One button a month, whatever the year (Sean, Nov 2026: not this November and next apart).
is("the twelve months to pick by, from this one on", monthsOfYear("2026-11-06").map((m) => `${m.key} ${m.label}`),
  ["11 Nov", "12 Dec", "01 Jan", "02 Feb", "03 Mar", "04 Apr", "05 May", "06 Jun", "07 Jul", "08 Aug", "09 Sep", "10 Oct"]);
is("matches by renewal month, whatever the year", byRenewalMonth(matches), { "02": 1, "12": 2, "06": 1 });
is("the matches to bring in: those renewing in the months picked, soonest first, so many", pickMatches(matches, ["12", "02"], 2).map((m) => m.lead_id), [2, 4]);
const novembers = [{ lead_id: 5, renewal: "2027-11-02" }, { lead_id: 6, renewal: "2026-11-20" }];
is("…this November and next one month: November, the sooner first", pickMatches(novembers, ["11"]).map((m) => m.lead_id), [6, 5]);
is("…counted together", byRenewalMonth(novembers), { "11": 2 });
is("…every month when none picked", pickMatches(matches, [], 10).map((m) => m.lead_id), [2, 4, 1, 3]);
const csv = matchReportCsv([{ client: "Capital, Inc", project: "Prescott_DBDev", status: "Active", lead_goal: 800, leads: 405, matches: 535, developed: 300, matched: 105,
  start_date: "2026-01-01", due_date: "2026-12-31" }], "2026-11-05").split("\r\n");
is("the report as a CSV, the old system's columns", csv[0], "Client Name,ProjectName,ProjectStatus,ProjectGoal,ActualLeads,LeadsOwed,%Complete,LeadMatches,DevelopedLeadsSinceStart,TotalMatchesAddedSinceStart,StartDate,DueDate,DaysBehind");
is("…a project a row", csv[1], '"Capital, Inc",Prescott_DBDev,Active,800,405,395,51%,535,300,105,01/01/2026,12/31/2026,124');

// "Renew …": the next four months, not this one (Sean, Nov 2026).
is("renewing soon, in November: December to March, not November", renewingSoon("2026-11-06").months.map((m) => m.key), ["2026-12", "2027-01", "2027-02", "2027-03"]);
is("…its column named so", renewingSoon("2026-11-06").label, "Dec–Mar");
is("…on the last day of a month, still the four after it", renewingSoon("2026-11-30").months.map((m) => m.key), ["2026-12", "2027-01", "2027-02", "2027-03"]);
is("…in the summer, across no year", [renewingSoon("2027-06-15").label, renewingSoon("2027-06-15").months[0].key], ["Jul–Oct", "2027-07"]);
is("…in December, into the new year", renewingSoon("2026-12-01").months.map((m) => m.key), ["2027-01", "2027-02", "2027-03", "2027-04"]);

console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll match report checks passed.\n");
process.exit(failures ? 1 : 0);
