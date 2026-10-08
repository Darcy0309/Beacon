#!/usr/bin/env node
/** Unit tests for lead delivery: a project's delivery addresses, and the lead sheet emailed. */
import { deliverySubject, parseDeliveryAddresses, renderLeadLink, renderLeadSheet } from "../../src/lib/delivery.js";
import { schemas, validate } from "../../src/lib/validate.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

const p = parseDeliveryAddresses("leads@capital.com, _jacob@capital.com; LEADS@capital.com\nproducer@capital.com");
check("addresses split on commas, semicolons and lines; repeats dropped",
  JSON.stringify(p.list.map((a) => a.address)) === JSON.stringify(["leads@capital.com", "jacob@capital.com", "producer@capital.com"]), JSON.stringify(p.list));
check("…a leading “_” sends that one a link, as the old system did", p.list[1].linkOnly && !p.list[0].linkOnly);
check("…“link only” sends every one a link", parseDeliveryAddresses("a@x.com, b@x.com", true).list.every((a) => a.linkOnly));
check("…anything not an address is named", JSON.stringify(parseDeliveryAddresses("a@x.com, jacob at capital").bad) === JSON.stringify(["jacob", "at", "capital"]));
check("the project form refuses a bad address, saying which", /Not an email address: nope/.test(validate({ name: "P", email: "a@x.com, nope" }, schemas.project).errors.email ?? ""));
check("…and takes good ones", !validate({ name: "P", email: "a@x.com; _b@y.org", delivery_link_only: "on" }, schemas.project).errors.email);

check("the subject reads “<result> - <company>”", deliverySubject("Lead-Hot Lead", "Calvary Baptist Church") === "Lead-Hot Lead - Calvary Baptist Church");

const sheet = {
  company: "Calvary <Baptist> & Co", result: "Appointment-Phone", client: "Capital Insurance Services",
  project: "CapitalIns-Churches", producer: "Jacob Termini", listSource: "IPA_AZ-Churches", rep: "Sean Fitzgerald",
  appointment: { date: "Oct 9, 2026", time: "10:00 AM", with: "Jacob", links: [
    { label: "Google", href: "https://calendar.google.com/calendar/render?action=TEMPLATE&text=x" },
    { label: "Apple", href: "https://lighthouse.example/sheet/abc.def/appointment.ics" },
  ] },
  people: [{ who: "Contact", name: "Pasty", title: "Admin", phone: "310-829-2481", email: "office@calvary.org" }, { who: "Decision maker", name: "" }],
  address: ["1502 20th St", "Santa Monica CA 90404"], map: "https://www.google.com/maps/search/?api=1&query=1502%2020th%20St", website: "calvarysantamonica.org",
  coverage: { ultimate: "Dec 23, 2026", agency: "Garry Insurance", lines: [{ label: "Package", xdate: "Dec 23, 2026", carrier: null }, { label: "Auto", xdate: null, carrier: null }] },
  profile: [["Locations", 2], ["Employees", 12], ["Autos", null], ["SIC code", "8661 – Religious Organizations"]],
  notes: [["Client notes", "<script>alert(1)</script>"]],
};
const { html, text } = renderLeadSheet(sheet);
check("the sheet carries the client, project, producer and list source", ["Capital Insurance Services", "CapitalIns-Churches", "Jacob Termini", "IPA_AZ-Churches"].every((x) => html.includes(x) && text.includes(x)));
check("…the result, and the appointment", html.includes("Appointment-Phone") && text.includes("Appointment: Oct 9, 2026 at 10:00 AM"), text);
check("…the contact, the address and the policy lines with something in them", text.includes("Business phone: 310-829-2481") && text.includes("Address: 1502 20th St, Santa Monica CA 90404") && text.includes("Package: Dec 23, 2026") && !text.includes("Auto:"), text);
check("…and leaves out a person with nothing on file", !text.includes("DECISION MAKER"));
check("no date or time of entry anywhere: not under the name, not in the Result", !/When|2:14 PM|Oct 7/.test(text) && !/When/.test(html), text.split("\n").slice(0, 8).join(" / "));
check("“Add to calendar” beside the appointment, with each calendar's link",
  html.includes("Add to calendar") && html.includes('href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=x"') && html.includes(">Apple</a>")
  && text.includes("Add to calendar, Apple: https://lighthouse.example/sheet/abc.def/appointment.ics"), text);
check("the website and email addresses open with a click",
  html.includes('href="https://calvarysantamonica.org"') && html.includes('href="mailto:office@calvary.org"')
  && text.includes("Website: calvarysantamonica.org\n") && text.includes("Email: office@calvary.org"), text.match(/Website: [^\n]*/)?.[0]);
check("the address opens Google Maps in any browser", html.includes('href="https://www.google.com/maps/search/?api=1&amp;query=1502%2020th%20St"') && html.includes(">1502 20th St, Santa Monica CA 90404</a>"));
const policy = text.slice(text.indexOf("POLICY INFORMATION")).split("\n").slice(1, 4);
check("the agency comes after the policies, not beside the renewal date", JSON.stringify(policy) === JSON.stringify(["Ultimate X-Date: Dec 23, 2026", "Package: Dec 23, 2026", "Agency: Garry Insurance"]), JSON.stringify(policy));
check("the profile: Locations above Employees, the SIC code with what it means",
  text.includes("PROFILE\nLocations: 2\nEmployees: 12\nSIC code: 8661 – Religious Organizations"), text.slice(text.indexOf("PROFILE")));
check("anything typed on a lead is shown, never run, in the email", html.includes("Calvary &lt;Baptist&gt; &amp; Co") && !html.includes("<script>") && html.includes("&lt;script&gt;"));
const link = renderLeadLink(sheet, "https://lighthouse.example/sheet/abc.def", 90);
check("a link-only email has the link and how long it works, not the sheet", link.html.includes('href="https://lighthouse.example/sheet/abc.def"') && /90 days/.test(link.text) && !link.text.includes("310-829-2481"));

console.log(failures ? `\n${failures} delivery check(s) failed.\n` : "\nAll delivery checks passed.\n");
process.exit(failures ? 1 : 0);
