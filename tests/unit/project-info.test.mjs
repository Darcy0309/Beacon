#!/usr/bin/env node
/** Unit tests for Project Info: its choices, the agent's area code, directions to a lead, the producers emailed leads. */
import {
  MAX_PRODUCERS, QUOTE_TIMES, US_STATES, WEEKDAYS, addressLine, areaCode, cleanProducers, directionsLink, hasProfile,
  infoProjectOf, leadPlace, producerAddresses, producerName, weekdayList, yesNoOf, yesWith,
} from "../../src/lib/project-info.js";
import { cross, schemas, validate } from "../../src/lib/validate.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

is("the states and DC, in alphabetical order", [US_STATES.length, US_STATES.slice(0, 4), US_STATES.includes("DC"), [...US_STATES].sort().join() === US_STATES.join()],
  [51, ["AK", "AL", "AR", "AZ"], true, true]);
is("the week, Monday first", WEEKDAYS.map(([d]) => d), [1, 2, 3, 4, 5, 6, 0]);
is("days to avoid in words, in the week's order", [weekdayList([5, 1]), weekdayList([0, 3, 1]), weekdayList([5, 1], { plural: true }), weekdayList([])],
  ["Mon & Fri", "Mon, Wed & Sun", "Mondays & Fridays", ""]);
is("the agent's area code, for the caller ID", ["(715) 934-2400", "1-715-934-2400 x12", "715.934.2400 ext. 3", "934-2400", null].map(areaCode), ["715", "715", "715", null, null]);
is("an office on one line", [addressLine({ address: "15561 Railroad St", city: "Hayward", state: "WI", zip: "54843" }), addressLine({ city: "Hayward", state: "WI" }), addressLine({})],
  ["15561 Railroad St, Hayward, WI 54843", "Hayward, WI", ""]);
is("where a lead is, for directions: its city, state and ZIP", leadPlace({ address: "1 Main St", city: "Eau Claire", state: "WI", zip: "54701" }), "Eau Claire, WI 54701");

const to = directionsLink("15561 Railroad St, Hayward, WI 54843", "Eau Claire, WI 54701");
const url = new URL(to);
check("directions from the office to the lead's city, by car, in Google Maps",
  url.origin === "https://www.google.com" && url.pathname === "/maps/dir/" && url.searchParams.get("api") === "1"
  && url.searchParams.get("origin") === "15561 Railroad St, Hayward, WI 54843" && url.searchParams.get("destination") === "Eau Claire, WI 54701"
  && url.searchParams.get("travelmode") === "driving", to);
is("…none without both ends", [directionsLink("", "Eau Claire, WI"), directionsLink("Hayward, WI", "")], [null, null]);

const producers = cleanProducers([
  { first: "  Josh ", last: "Huray", email: "jhuray@ruralins.com", leads: true },
  { first: "", last: "", email: "", leads: true },
  { first: "Amy", last: "Lee", email: "", leads: true },
  { first: "Bo", last: "", email: "bo@ruralins.com", leads: false },
  { email: "team@ruralins.com", leads: "on" },
  { first: "6" }, { first: "7" },
]);
is("producers as kept: trimmed, empty rows dropped, five at most, leads only with an address",
  producers.map((p) => [p.first, p.last, p.email, p.leads]),
  [["Josh", "Huray", "jhuray@ruralins.com", true], ["Amy", "Lee", "", false], ["Bo", "", "bo@ruralins.com", false], ["", "", "team@ruralins.com", true], ["6", "", "", false]]);
check("…five rows", MAX_PRODUCERS === 5 && cleanProducers(Array.from({ length: 9 }, (_, i) => ({ first: `P${i}` }))).length === 5);
is("the producers ticked get each lead by email", producerAddresses(producers), ["jhuray@ruralins.com", "team@ruralins.com"]);
is("a producer's name", [producerName(producers[0]), producerName(producers[3])], ["Josh Huray", ""]);

is("yes, no, or unanswered", [yesNoOf(true), yesNoOf(false), yesNoOf(null)], ["Yes", "No", null]);
is("a yes with its number", [yesWith(true, 10, "employees"), yesWith(true, 1500, "covered lives"), yesWith(true, null, "autos"), yesWith(false, 10, "autos"), yesWith(null, 3, "autos")],
  ["Yes · 10+ employees", "Yes · 1,500+ covered lives", "Yes", "No", null]);
is("a DB dev project's Project Info is its appointment project's", [infoProjectOf({ id: 4, appt_project_id: 9 }), infoProjectOf({ id: 4, appt_project_id: null }), infoProjectOf(null)], [9, 4, null]);
is("filled in, or not yet", [hasProfile(null), hasProfile({ producers: [], states_licensed: [] }), hasProfile({ avoid_days: [1] }), hasProfile({ wc_mono: false }), hasProfile({ producers: [{ email: "a@b.co" }] })],
  [false, false, true, true, true]);

// The form's checks: the schema the server action and the form share.
const form = (values) => validate(values, schemas.projectInfo, cross.projectInfo).errors;
is("a filled-in form passes", form({
  contact_name: "Josh Huray", address: "15561 Railroad St", city: "Hayward", state: "WI", zip: "54843", phone: "(715) 934-2400",
  agent_mobile: "715-555-0101", agent_email: "jhuray@ruralins.com", producer_first_1: "Josh", producer_email_1: "jhuray@ruralins.com", producer_leads_1: "on",
  personal_lines: "yes", min_employees: "5", quote_time: QUOTE_TIMES[1], quote_min_time: "3-4 weeks", wc_mono: "yes", wc_min_employees: "10",
}), {});
is("…and what does not", Object.keys(form({
  state: "ZZ", zip: "548", phone: "934-2400", agent_email: "josh at rural", producer_email_2: "x@", producer_leads_3: "on",
  min_employees: "251", quote_time: "2 months", wc_mono: "maybe", health_min_lives: "-1",
})).sort(), ["agent_email", "health_min_lives", "min_employees", "phone", "producer_email_2", "producer_email_3", "quote_time", "state", "wc_mono", "zip"]);
is("…a state by its name is read as its code", form({ state: "Wisconsin" }), {});
is("…a producer ticked for leads needs their email", form({ producer_first_2: "Amy", producer_leads_2: "on" }), { producer_email_2: "Add their email to send them leads" });
is("the link goes to one address", [validate({ project_id: "4", to: "jhuray@ruralins.com" }, schemas.infoLink).ok, Object.keys(validate({ project_id: "4", to: "a@b.co, c@d.co" }, schemas.infoLink).errors)],
  [true, ["to"]]);

console.log(failures ? `\n${failures} Project Info check(s) failed.\n` : "\nAll Project Info checks passed.\n");
process.exit(failures ? 1 : 0);
