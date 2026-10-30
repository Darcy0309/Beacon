#!/usr/bin/env node
/** Unit tests for filling in a list's missing city, state, county and ZIP (fill-places.js), on the real ZIP file. */
import { readFileSync } from "node:fs";
import { cityKey, countyKey, fillPlace, placeIndex } from "../../src/lib/fill-places.js";

let failures = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failures++; }
};
const index = placeIndex(JSON.parse(readFileSync(new URL("../../src/data/zip-places.json", import.meta.url), "utf8")).zips);
const fill = (lead) => { const l = { ...lead }; const f = fillPlace(l, index); return [l, f]; };

is("names compared as written: St. as Saint, Ft as Fort, Mt as Mount", [cityKey("St. Paul"), cityKey("Ft Myers"), cityKey("MT. PLEASANT"), cityKey("Port St Lucie")],
  ["saint paul", "fort myers", "mount pleasant", "port saint lucie"]);
is("counties without County or Parish", [countyKey("Maricopa County"), countyKey("East Baton Rouge Parish"), countyKey("maricopa")], ["maricopa", "east baton rouge", "maricopa"]);

// A ZIP gives what is missing.
is("a ZIP alone: its city, state and county", fill({ zip: "54911" }), [{ zip: "54911", state: "WI", city: "Appleton", county: "Outagamie" }, ["state", "city", "county"]]);
is("…ZIP+4 too", fill({ zip: "85201-1234" })[0], { zip: "85201-1234", state: "AZ", city: "Mesa", county: "Maricopa" });
is("a ZIP and a city: the county", fill({ zip: "85201", city: "Mesa", state: "AZ" }), [{ zip: "85201", city: "Mesa", state: "AZ", county: "Maricopa" }, ["county"]]);
is("a ZIP with its county given: the city", fill({ zip: "55101", county: "Ramsey" }), [{ zip: "55101", county: "Ramsey", state: "MN", city: "Saint Paul" }, ["state", "city"]]);
is("what the list says is kept, never written over", fill({ zip: "85201", city: "East Mesa", county: "Pinal" }), [{ zip: "85201", city: "East Mesa", county: "Pinal", state: "AZ" }, ["state"]]);
is("a ZIP whose state is not the one given: left alone (one of them is wrong)", fill({ zip: "85201", state: "WI" }), [{ zip: "85201", state: "WI" }, []]);
is("a ZIP a spreadsheet took the leading zero off: put right", fill({ zip: "2108" }), [{ zip: "02108", state: "MA", city: "Boston", county: "Suffolk" }, ["zip", "state", "city", "county"]]);
is("a ZIP that is no ZIP: nothing", fill({ zip: "99999", city: "Mesa", state: "AZ" })[1], []);

// A city and its state.
const appleton = fill({ city: "Appleton", state: "WI" });
is("a city of several ZIPs in one county: the county, not a ZIP", appleton[1].includes("zip") ? "zip" : appleton[0].county ?? null,
  index.byCity.get("WI|appleton").counties.size === 1 ? "Outagamie" : null);
const one = Object.entries(index.zips).find(([, [c, s]]) => index.byCity.get(`${s}|${cityKey(c)}`).zips.length === 1);
is("a city with one ZIP: its ZIP and county", fill({ city: one[1][0], state: one[1][1] })[0], { city: one[1][0], state: one[1][1], zip: one[0], county: one[1][2] });
is("…written as the list writes it (Ft.), found all the same", fill({ city: "Ft. Atkinson", state: "WI" })[0], { city: "Ft. Atkinson", state: "WI", zip: "53538", county: "Jefferson" });
is("a city whose ZIPs are in several counties (St. Paul): no county, no ZIP", fill({ city: "St. Paul", state: "MN" })[1], []);
is("a city with no state: its state when only one has it", fill({ city: "Kaukauna" })[0].state, "WI");
is("…not when several do (Springfield)", fill({ city: "Springfield" }), [{ city: "Springfield" }, []]);
is("…or the one with it in the county given", fill({ city: "Springfield", county: "Sangamon County" })[0].state, "IL");
is("a county alone: nothing more can be said", fill({ county: "Maricopa", state: "AZ" }), [{ county: "Maricopa", state: "AZ" }, []]);
is("a city the file doesn't have: nothing", fill({ city: "Nowhereville", state: "AZ" })[1], []);

console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll fill places checks passed.\n");
process.exit(failures ? 1 : 0);
