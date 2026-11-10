#!/usr/bin/env node
/** Unit tests for the report charts' value axis (lib/chart-scale.js). */
import { niceScale, tickLabel } from "../../src/lib/chart-scale.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const same = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// --- the axis ---------------------------------------------------------------
same("582 tops out at 600, in 200s", niceScale(582), { top: 600, ticks: [0, 200, 400, 600] });
same("nothing to show still draws 0 to 4", niceScale(0), { top: 4, ticks: [0, 1, 2, 3, 4] });
same("a small count ticks in whole numbers", niceScale(3), { top: 4, ticks: [0, 1, 2, 3, 4] });
same("…never at halves", niceScale(9).ticks.every(Number.isInteger), true);
same("a round maximum is the top itself", niceScale(800).top, 800);
same("9,867 leads: 0 to 10,000", niceScale(9867), { top: 10000, ticks: [0, 2500, 5000, 7500, 10000] });
same("three ticks for a tile", niceScale(312, 2), { top: 400, ticks: [0, 200, 400] });
same("junk reads as nothing", niceScale(NaN).top, 4);
for (const m of [1, 5, 7, 13, 99, 101, 250, 999, 1234, 48213, 7e6]) {
  const s = niceScale(m);
  check(`${m}: the top covers it, without much to spare, at most six steps`,
    s.top >= m && s.top < m * 2.6 + 4 && s.ticks.length <= 7 && s.ticks[0] === 0 && s.ticks.at(-1) === s.top, JSON.stringify(s));
}

// --- the figures ------------------------------------------------------------
same("in full under 10,000", tickLabel(7500, 10000 - 1), "7,500");
same("compact on an axis that reaches 10,000", [tickLabel(2500, 10000), tickLabel(10000, 10000)], ["2.5K", "10K"]);
same("millions", tickLabel(1500000, 2e6, "$"), "$1.5M");
same("money in full", tickLabel(250, 1000, "$"), "$250");
same("zero is 0 on a compact axis, never 0K", [tickLabel(0, 10000), tickLabel(0, 150000, "$"), tickLabel(0, 600)], ["0", "$0", "0"]);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll chart-scale checks passed.");
