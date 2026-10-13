#!/usr/bin/env node
/** Unit tests for the client and project figures: the conversions, and a project's figures in a line. */
import { pct, pctLabel, shapeStats, statsLine } from "../../src/lib/lead-stats.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

const s = shapeStats({ names: 8447, names_left: 6861, leads_active: 1200, leads_resolved: 327, developed: 1527, appointments: 280, invalid_appointments: 17 });
is("leads are the active and the resolved together", s.leads, 1527);
is("names to leads developed, as a percentage", s.leadRate, 18);
is("leads to appointments: invalid ones were set too", [s.appointmentsSet, s.apptRate], [297, 19]);
is("nothing to compare with is a dash, not 0%", [pct(0, 0), pctLabel(pct(0, 0)), pctLabel(pct(1, 4))], [null, "—", "25%"]);
is("an empty project counts nothing", shapeStats(null).names + shapeStats(undefined).leads, 0);
is("a DB dev project's line", statsLine(s, "DBDV"),
  ["8,447 names", "6,861 left to call", "1,527 leads (1,200 active, 327 resolved)", "280 appointments, 17 invalid", "18% names to leads", "19% leads to appointments"]);
is("an appointment project's: no names left to call", statsLine(shapeStats({ names: 1, leads_active: 1, appointments: 1 }), "APPT"),
  ["1 name", "1 lead (1 active, 0 resolved)", "1 appointment"]);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll lead stats checks passed.");
