#!/usr/bin/env node
/** Unit tests for a lead page's back link: back to the list it was opened from, never anywhere else. */
import { backFrom, leadHref, listAddress } from "../../src/lib/back-link.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

check("back to the Lead Explorer, its filters kept", JSON.stringify(backFrom("/explore?sic=1711&months=7")) === JSON.stringify({ href: "/explore?sic=1711&months=7", label: "Back to Lead Explorer" }));
check("…or the Leads, Appointments, a project, a client, QA", ["/leads?client=5", "/appointments", "/projects/12", "/clients/capital-ins", "/qa"].every((h) => backFrom(h)?.href === h));
check("never off the app or anywhere else in it", ["//evil.test/explore", "https://evil.test/explore", "/explorer", "/settings", "/explore\\x", "javascript:alert(1)", " /explore x", "", null].every((h) => backFrom(h) === null));
check("a list's address carries its filters", listAddress("/explore", { sic: "1711", months: "7", skip: ["a"] }) === "/explore?sic=1711&months=7");
check("…and none when there are none", listAddress("/leads", {}) === "/leads");
check("a lead opened from it passes it along", leadHref(5, "/explore?sic=1711&months=7") === "/leads/5?from=%2Fexplore%3Fsic%3D1711%26months%3D7" && leadHref(5, null) === "/leads/5");

console.log(failures ? `\n${failures} back link check(s) failed.\n` : "\nAll back link checks passed.\n");
process.exit(failures ? 1 : 0);
