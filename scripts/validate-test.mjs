#!/usr/bin/env node
/** Unit tests for the shared form validation. */
import { rules, validate, schemas, cross } from "../lib/validate.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const passes = (label, rule, v) => check(label, rule(v) === null, `got "${rule(v)}"`);
const fails = (label, rule, v) => check(label, rule(v) !== null, "expected an error");

// --- individual rules -------------------------------------------------------
fails("required rejects empty", rules.required(), "");
fails("required rejects whitespace", rules.required(), "   ");
passes("required accepts text", rules.required(), "x");

passes("email: valid", rules.email, "jeff@garryins.test");
fails("email: no @", rules.email, "jeff.garryins.test");
fails("email: no tld", rules.email, "jeff@garry");
passes("email: empty is fine (optional)", rules.email, "");

passes("phone: (602) 555-0100", rules.phone, "(602) 555-0100");
passes("phone: 602-555-0100", rules.phone, "602-555-0100");
passes("phone: +1 6025550100", rules.phone, "+1 6025550100");
fails("phone: too short", rules.phone, "555-0100");
fails("phone: letters", rules.phone, "call me");

passes("date: valid", rules.date, "2026-10-14");
fails("date: Feb 30", rules.date, "2026-02-30");
fails("date: wrong format", rules.date, "10/14/2026");

passes("time12: 9:30 AM", rules.time12, "9:30 AM");
passes("time12: 12:00 pm", rules.time12, "12:00 pm");
fails("time12: 24h", rules.time12, "14:30");
fails("time12: 13 PM", rules.time12, "13:00 PM");

passes("int: 42", rules.int({ min: 0 }), "42");
passes("int: 1,200 with comma", rules.int({ min: 0 }), "1,200");
fails("int: negative below min", rules.int({ min: 0 }), "-1");
fails("int: decimal", rules.int(), "4.5");
fails("int: above max", rules.int({ max: 10 }), "11");

passes("num: $12,400.50", rules.num({ min: 0 }), "$12,400.50");
fails("num: text", rules.num(), "twelve");

passes("id: 7", rules.id, "7");
fails("id: 0", rules.id, "0");
fails("id: abc", rules.id, "abc");

passes("stateCode: AZ", rules.stateCode, "AZ");
passes("stateCode: arizona", rules.stateCode, "arizona");
fails("stateCode: ZZ", rules.stateCode, "ZZ");

passes("zip: 85016", rules.zip, "85016");
passes("zip: 85016-1234", rules.zip, "85016-1234");
fails("zip: 8501", rules.zip, "8501");

passes("urlOrPath: https", rules.urlOrPath, "https://cdn.example.com/logo.svg");
passes("urlOrPath: /logo.svg", rules.urlOrPath, "/logo.svg");
fails("urlOrPath: bare word", rules.urlOrPath, "logo.svg");

passes("hostname: smtp.office365.com", rules.hostname, "smtp.office365.com");
fails("hostname: has space", rules.hostname, "smtp office");
fails("hostname: no tld", rules.hostname, "localhost");


passes("username: darcy_j", rules.username, "darcy_j");
fails("username: too short", rules.username, "ab");
fails("username: spaces", rules.username, "darcy j");

// --- schemas + cross-field --------------------------------------------------
{
  const r = validate({ company_name: "", state: "Freedonia", employees: "lots" }, schemas.lead);
  check("lead: collects one error per field", !r.ok && Object.keys(r.errors).length === 3, JSON.stringify(r.errors));
  check("lead: first failing rule wins", r.errors.company_name === "Company name is required");
}
{
  const r = validate({ company_name: "Acme", state: "AZ", employees: "42", email: "" }, schemas.lead);
  check("lead: valid record passes", r.ok, JSON.stringify(r.errors));
}
{
  const r = validate({ name: "P", start_date: "2026-10-10", end_date: "2026-10-01" }, schemas.project, cross.project);
  check("project: end before start is rejected", r.errors.end_date?.includes("on or after"));
}
{
  const r = validate({ email: "c@x.test", role: "client", company_id: "" }, schemas.user, cross.user);
  check("user: client without company is rejected", Boolean(r.errors.company_id));
  const r2 = validate({ email: "c@x.test", role: "client", company_id: "3" }, schemas.user, cross.user);
  check("user: client with company passes", r2.ok, JSON.stringify(r2.errors));
  const r3 = validate({ email: "a@x.test", role: "admin" }, schemas.user, cross.user);
  check("user: admin needs no company", r3.ok, JSON.stringify(r3.errors));
}
{
  const r = validate({ lead_id: "5", appt_date: "2031-01-01", appt_time: "9:00 AM" }, schemas.appointment, cross.appointment);
  check("appointment: far-future date rejected", Boolean(r.errors.appt_date));
  const r2 = validate({ lead_id: "", appt_date: "", appt_time: "" }, schemas.appointment);
  check("appointment: required trio reported", ["lead_id", "appt_date", "appt_time"].every((k) => r2.errors[k]));
}
{
  const r = validate({ message: "hi" }, schemas.bulletin);
  check("bulletin: 2-char message too short", Boolean(r.errors.message));
  const r2 = validate({ message: "x".repeat(101) }, schemas.bulletin);
  check("bulletin: 101 chars too long", Boolean(r2.errors.message));
}

console.log(failures ? `\n${failures} test(s) failed.\n` : "\nAll validation tests passed.\n");
process.exit(failures ? 1 : 0);
