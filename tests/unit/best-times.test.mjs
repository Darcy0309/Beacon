#!/usr/bin/env node
/** Unit tests for Best Times to Call (Nov 2026): a week of counts, rates, best and worst hours, a best span. */
import { MIN_CALLS, bestSpan, clockOf, hourSpan, lengthOf, pct, rateOf, slowStart, weekOf, windows } from "../../src/lib/best-times.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

const rows = [
  { dow: 2, hour: 8, calls: 100, leads: 12, appts: 3 },
  { dow: 2, hour: 9, calls: 80, leads: 4, appts: 4 },
  { dow: 3, hour: 8, calls: 60, leads: 6, appts: 0 },
  { dow: 1, hour: 12, calls: 50, leads: 0, appts: 1 },
  { dow: 5, hour: 16, calls: 5, leads: 3, appts: 0 },
  { dow: 6, hour: 10, calls: 30, leads: 1, appts: 0 },
];
const week = weekOf(rows);
check("a week: Mon–Fri, Saturday when called, 7 AM–6 PM at least", JSON.stringify(week.days) === "[1,2,3,4,5,6]" && week.hours[0] === 7 && week.hours.at(-1) === 18);
check("…its totals", week.total.calls === 325 && week.total.leads === 26 && week.total.appts === 8);
check("rates by mode", rateOf(week.cell(2, 8)) === 0.15 && rateOf(week.cell(2, 8), "leads") === 0.12 && rateOf(week.cell(2, 8), "appts") === 0.03 && rateOf(null) === null);
const w = windows(week, "both", 2);
check("best hours, an hour with too few calls left out", w.best[0].dow === 2 && w.best[0].hour === 8 && !w.best.some((c) => c.calls < MIN_CALLS), JSON.stringify(w.best));
check("…worst hours", w.worst[0].dow === 1 && w.worst[0].hour === 12, JSON.stringify(w.worst));
const span = bestSpan(week);
const two = windows(weekOf([{ dow: 2, hour: 8, calls: 30, leads: 6, appts: 0 }, { dow: 2, hour: 12, calls: 30, leads: 0, appts: 0 }]));
check("two hours to judge: one best, one worst, never both", two.best.length === 1 && two.worst.length === 1 && two.best[0].hour === 8 && two.worst[0].hour === 12);
check("a best two hours on weekdays", span.hour === 8 && span.calls === 240, JSON.stringify(span));
check("hour spans read as people say them", hourSpan(9) === "9–10 AM" && hourSpan(11) === "11 AM–12 PM" && hourSpan(12) === "12–1 PM" && hourSpan(8, 2) === "8–10 AM");
check("a rate", pct(0.0971) === "9.7%" && pct(null) === "—");
check("Early Starts: a first call's time, a time to a lead", clockOf(492.5) === "8:13 AM" && clockOf(780) === "1:00 PM" && clockOf(null) === "—" && lengthOf(85) === "1h 25m" && lengthOf(40) === "40m");
check("…a slow start: early calls converting at under half the later rate",
  slowStart({ early_calls: 40, early_leads: 1, early_appts: 0, later_calls: 100, later_leads: 10, later_appts: 0 })
  && !slowStart({ early_calls: 40, early_leads: 4, early_appts: 0, later_calls: 100, later_leads: 10, later_appts: 0 })
  && !slowStart({ early_calls: 5, early_leads: 0, early_appts: 0, later_calls: 100, later_leads: 10, later_appts: 0 }));

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log("\nbest times: all passed");
