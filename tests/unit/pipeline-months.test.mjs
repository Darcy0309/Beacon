#!/usr/bin/env node
/** Unit tests for the Pipeline by Month (pipeline-months.js), on Sean's own sheet's figures (Nov 2026). */
import { DEFAULT_CONVERSION, pipelineByMonth as pipelineMonths } from "../../src/lib/pipeline-months.js";

let failures = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failures++; }
};

// His sheet: total, off the list (appointments in it), appointments. Viable = total − off.
const SHEET = [[214, 36, 26], [115, 28, 22], [139, 22, 22], [131, 24, 24], [105, 21, 21], [121, 16, 16],
  [108, 13, 13], [97, 16, 15], [100, 18, 18], [153, 19, 18], [148, 25, 22], [101, 39, 25]];
const months = SHEET.map(([total, offAll, appts], i) => ({
  month: i + 1, short: "JanFebMarAprMayJunJulAugSepOctNovDec".slice(i * 3, i * 3 + 3),
  total, appointment: appts, off: offAll - appts, viable: total - offAll,
}));
const p = pipelineMonths(months, null);

is("20% unless the project says otherwise", [p.rate, DEFAULT_CONVERSION], [20, 20]);
is("January as his sheet: 214, 36 off (its appointments among them), 178 viable, 43 projected, 12%, 26 set",
  p.months[0], { month: 1, short: "Jan", total: 214, off: 36, viable: 178, projected: 43, conversion: 12, appointments: 26 });
is("December: 25% converted", p.months[11].conversion, 25);
is("the conversion of each month, as his sheet has them", p.months.map((m) => m.conversion), [12, 19, 16, 18, 20, 13, 12, 15, 18, 12, 15, 25]);
is("the year: 1,532 leads, 277 off, 1,255 viable, 306 projected, 242 set", [p.total.total, p.total.off, p.total.viable, p.total.projected, p.total.appointments], [1532, 277, 1255, 306, 242]);
is("…16% overall", p.overall, 16);
is("a project's own rate: 25% of January's 214 is 54", pipelineMonths(months, 25).months[0].projected, 54);
is("…a rate of 0 is 0, not the default", [pipelineMonths(months, 0).rate, pipelineMonths(months, 0).total.projected], [0, 0]);
is("a month with no leads: no conversion to speak of", pipelineMonths([{ month: 2, short: "Feb", total: 0, appointment: 0, off: 0, viable: 0 }], 20).months[0].conversion, null);

console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll pipeline months checks passed.\n");
process.exit(failures ? 1 : 0);
