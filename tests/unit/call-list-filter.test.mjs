#!/usr/bin/env node
/** Unit tests for a call list's filter: windows of the year, cleaning what is saved, and the filter in words. */
import { cleanCriteria, criteriaCount, describeCriteria, monthDay, monthDayLabel, monthWindow, renewsIn } from "../../src/lib/call-list-filter.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// --- a window of the year -------------------------------------------------------
is("a day of the year", monthDay(11, 1), "11-01");
is("…not one that does not exist", monthDay(4, 31), null);
is("…February 29 counts", monthDay(2, 29), "02-29");
is("a whole month", monthWindow(12), { from: "12-01", to: "12-31" });
is("…February, to its 29th", monthWindow(2), { from: "02-01", to: "02-29" });
is("in words", monthDayLabel("01-31"), "Jan 31");
const winter = { from: "11-01", to: "01-31" };
is("Nov 1 – Jan 31 runs over the new year, whatever the year",
  ["2019-11-01", "2026-12-15", "2031-01-31", "2026-02-01", "2026-10-31", null].map((d) => renewsIn(winter, d)),
  [true, true, true, false, false, false]);
is("…a window inside one year", ["2026-12-01", "2026-12-31", "2026-11-30"].map((d) => renewsIn(monthWindow(12), d)), [true, true, false]);

// --- what is saved ----------------------------------------------------------------
is("no filter is {}", cleanCriteria({}), {});
is("only what the filter knows, well formed",
  cleanCriteria({
    renewal: { from: "11-01", to: "01-31", exclude: "yes" },
    city: { values: ["phoenix", " mesa ", "phoenix", "", 7], exclude: true },
    zip: { values: [] },
    nonsense: { values: ["x"] },
    carrier: "hartford",
  }),
  { renewal: { from: "11-01", to: "01-31", exclude: false }, city: { values: ["phoenix", "mesa", "7"], exclude: true } });
is("…a window that is not one is dropped", cleanCriteria({ renewal: { from: "02-30", to: "03-01" } }), {});
is("…long lists are cut to 300", cleanCriteria({ zip: { values: Array.from({ length: 400 }, (_, i) => String(i)) } }).zip.values.length, 300);
is("how many criteria", criteriaCount({ renewal: winter, city: { values: ["mesa"] }, zip: { values: [] } }), 2);

// --- in words ---------------------------------------------------------------------
is("the filter in words, with labels",
  describeCriteria(
    { renewal: winter, city: { values: ["phoenix", "mesa"] }, carrier: { values: ["the hartford"], exclude: true } },
    { city: [{ value: "phoenix", label: "Phoenix" }, { value: "mesa", label: "Mesa" }], carrier: [{ value: "the hartford", label: "The Hartford" }] }
  ).map((d) => d.text),
  ["Renews Nov 1 – Jan 31", "City: Phoenix, Mesa", "Not carrier: The Hartford"]);
is("a window on one policy line keeps it, and says so",
  [cleanCriteria({ renewal: { from: "12-01", to: "12-31", line: "wc" } }).renewal.line, describeCriteria({ renewal: { from: "12-01", to: "12-31", line: "wc" } })[0].text],
  ["wc", "Renews Dec 1 – Dec 31 (Workers comp)"]);
is("…a line that is not one means any line", cleanCriteria({ renewal: { from: "12-01", to: "12-31", line: "boats" } }).renewal.line, undefined);
is("the list a name came from, included or not", describeCriteria({ source: { values: ["ipa-maricopa"], exclude: true } }, { source: [{ value: "ipa-maricopa", label: "IPA-Maricopa" }] })[0].text, "Not list source: IPA-Maricopa");
is("…a long list shortened", describeCriteria({ zip: { values: ["85001", "85002", "85003", "85004", "85005"] } })[0].text, "ZIP code: 85001, 85002, 85003 +2");

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll call list filter checks passed.");
