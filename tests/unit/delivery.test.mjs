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
  company: "Calvary <Baptist> & Co", result: "Appointment-Phone", when: "Oct 7, 2026, 2:14 PM", client: "Capital Insurance Services",
  project: "CapitalIns-Churches", producer: "Jacob Termini", listSource: "IPA_AZ-Churches", rep: "Sean Fitzgerald",
  appointment: { date: "Oct 9, 2026", time: "10:00 AM", with: "Jacob" },
  people: [{ who: "Contact", name: "Pasty", title: "Admin", phone: "310-829-2481", email: "office@calvary.org" }, { who: "Decision maker", name: "" }],
  address: ["1502 20th St", "Santa Monica CA 90404"], website: "calvarysantamonica.org",
  coverage: { ultimate: "Dec 23, 2026", agency: null, lines: [{ label: "Package", xdate: "Dec 23, 2026", carrier: null }, { label: "Auto", xdate: null, carrier: null }] },
  profile: [["Employees", 12], ["Autos", null]], notes: [["Call notes", "<script>alert(1)</script>"]],
};
const { html, text } = renderLeadSheet(sheet);
check("the sheet carries the client, project, producer and list source", ["Capital Insurance Services", "CapitalIns-Churches", "Jacob Termini", "IPA_AZ-Churches"].every((x) => html.includes(x) && text.includes(x)));
check("…the result, and the appointment", html.includes("Appointment-Phone") && text.includes("Appointment: Oct 9, 2026 at 10:00 AM"), text);
check("…the contact, the address and the policy lines with something in them", text.includes("Business phone: 310-829-2481") && text.includes("Address: 1502 20th St, Santa Monica CA 90404") && text.includes("Package: Dec 23, 2026") && !text.includes("Auto:"), text);
check("…and leaves out a person with nothing on file", !text.includes("DECISION MAKER"));
check("anything typed on a lead is shown, never run, in the email", html.includes("Calvary &lt;Baptist&gt; &amp; Co") && !html.includes("<script>") && html.includes("&lt;script&gt;"));
const link = renderLeadLink(sheet, "https://lighthouse.example/sheet/abc.def", 90);
check("a link-only email has the link and how long it works, not the sheet", link.html.includes('href="https://lighthouse.example/sheet/abc.def"') && /90 days/.test(link.text) && !link.text.includes("310-829-2481"));

console.log(failures ? `\n${failures} delivery check(s) failed.\n` : "\nAll delivery checks passed.\n");
process.exit(failures ? 1 : 0);
