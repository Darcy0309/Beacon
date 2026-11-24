#!/usr/bin/env node
/** Unit tests for US holidays on the calendars (Nov 2026): each on its date, and the weekday a weekend one is observed. */
import { holidayLabel, holidayOn, holidaysOf } from "../../src/lib/holidays.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const name = (d) => holidayOn(d)?.name ?? null;

check("2026's eleven, and Independence Day observed on Friday the 3rd", Object.keys(holidaysOf(2026)).length === 12 && holidayOn("2026-07-03")?.observed === true,
  JSON.stringify(holidaysOf(2026)));
check("the Monday ones: MLK, Presidents', Memorial, Labor, Columbus", name("2026-01-19") === "Martin Luther King Jr. Day" && name("2026-02-16") === "Presidents' Day"
  && name("2026-05-25") === "Memorial Day" && name("2026-09-07") === "Labor Day" && name("2026-10-12") === "Columbus Day");
check("Thanksgiving: the fourth Thursday", name("2026-11-26") === "Thanksgiving Day" && name("2027-11-25") === "Thanksgiving Day" && name("2025-11-27") === "Thanksgiving Day");
check("Memorial Day: the last Monday, in a May with five", name("2027-05-31") === "Memorial Day" && !holidayOn("2027-05-24"));
check("a Sunday holiday observed the Monday after", holidayOn("2022-12-26")?.observed && name("2022-12-26") === "Christmas Day" && holidayOn("2022-12-25")?.observed === false);
check("New Year's Day on a Saturday: observed December 31 the year before", holidayOn("2027-12-31")?.name === "New Year's Day" && holidayOn("2027-12-31").observed);
check("said with (observed)", holidayLabel(holidayOn("2026-07-03")) === "Independence Day (observed)" && holidayLabel(holidayOn("2026-07-04")) === "Independence Day");
check("an ordinary day: none", holidayOn("2026-11-24") === null && holidayOn("nope") === null);

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log("\nholidays: all passed");
