/**
 * The lead sheet as the client asked (Sean, October 2026), end to end:
 *   - setting an appointment asks for the note "For the client", which is
 *     what the client gets; the call notes and the lead's internal notes
 *     never reach them, in the email or in the app;
 *   - the email says nothing of when it was entered, has "Add to calendar"
 *     (Google, Outlook, Apple's .ics at the right time) beside the
 *     appointment, the address as a Google Maps link, the SIC code with what
 *     it means, Locations above Employees, and the agency after the policies;
 *   - the lead's Business tab has Locations and EIN (typed on the lead,
 *     written one way); the appointment form's "For the client" can be edited.
 *
 * Needs the app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (any
 * SMTP_USER and SMTP_PASSWORD), as the delivery test does.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";
import { APP_URL } from "../support/env.mjs";
import { appointmentSpan } from "../../src/lib/appointment-links.js";

const RUN = Date.now();
const TAG = `LSE-TEST ${RUN}`;
const SHEET_TO = `leads.${RUN}@capital.test`;
const NOTE = "Appt set with Daniel and Henry, both owners – Fri 10/9 @ 10am";
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const MIKE = userId("mike@beacon.test");
const CLIENT_USER = userId("client@beacon.test");
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const mailSetting = sql("select value::text from public.app_settings where key = 'mail'");
sql(`update public.app_settings set value = value || '{"from": "alerts@signaturemktg.net"}'::jsonb where key = 'mail'`);

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, email)
  values (${lit(`${TAG} Appointments`)}, ${company}, ${typeId("APPT")}, 1, ${lit(SHEET_TO)}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${MIKE})`);
const lead = Number(sql(`insert into public.leads (company_name, contact_name, phone, address, city, state, zip, sic_code, location, employees,
    sales_volume, years_in_business, project_id, assigned_user_id)
  values (${lit(`${TAG} A & Sons Elect`)}, 'Daniel', '602-555-0101', '12 Main St', 'Phoenix', 'AZ', '85004', '1731', '3', '14',
    '$2.1M', '12', ${APPT}, ${MIKE}) returning id`));
sql(`insert into public.lead_notes (lead_id, notes_dcm, notes_client) values (${lead}, 'INTERNAL-SECRET owner is hard', 'OLD-HISTORY 9/1/26 seanf: left vm')`);
sql(`insert into public.insurance_details (lead_id, ultimate_xdate, agency_name, pkg_xdate) values (${lead}, '2027-03-01', 'Garry Insurance', '2027-03-01')`);
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT_USER}`);
sql(`update public.users set company_id=${company} where id=${CLIENT_USER}`);
const tomorrow = sql("select ((now() at time zone public.business_tz())::date + 1)::text");

const mail = await startMailCatcher(2525);
const browser = await launchBrowser();
const sent = (to) => mail.messages.filter((m) => m.to.includes(to));
/** A message's text, quoted-printable undone (as UTF-8). */
const plain = (m) => Buffer.from(m.raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8");
const pick = (page, name) => page.ev(`(() => { const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === ${JSON.stringify(name)}); if (!b) return false; b.click(); return true; })()`);

try {
  section("Setting the appointment");
  const mike = await (await browser.newContext({ as: "mike@beacon.test" })).newPage();
  await mike.go(`/leads/${lead}`, 4000);
  await pick(mike, "Appointment");
  check("an appointment asks for the note “For the client”, the call notes marked internal",
    Boolean(await until(() => mike.ev(`!!document.querySelector('textarea[data-client-note]')`)))
    && /Internal: the client never sees them/.test(await mike.text()));
  await mike.fill('input[name="appt_date"]', tomorrow);
  await mike.fill('select[name="appt_time"]', "10:00 AM");
  await mike.fill('input[name="rep_name"]', "Jacob Termini");
  await mike.fill('textarea[name="notes"]', "INTERNAL-CALL-NOTE spoke with Daniel");
  await mike.fill("textarea[data-client-note]", NOTE);
  await mike.click("button", "Save:");
  check("saved: the note is the lead's note for the client", Boolean(await until(() => sql(`select client_note from public.leads where id = ${lead}`) === NOTE)),
    sql(`select coalesce(client_note, '') from public.leads where id = ${lead}`));

  section("The email");
  check("the sheet is emailed", Boolean(await until(() => sent(SHEET_TO).length === 1, { timeout: 15000 })));
  const body = sent(SHEET_TO)[0] ? plain(sent(SHEET_TO)[0]) : "";
  check("“For the client” is the note written now", body.includes(NOTE), body.slice(body.indexOf("NOTES"), body.indexOf("NOTES") + 200));
  check("…never the call notes, the internal notes or the old system's", !/INTERNAL-CALL-NOTE|INTERNAL-SECRET|OLD-HISTORY|Call notes/.test(body));
  check("nothing says when it was entered", !/\bWhen\b/.test(body) && !body.includes(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).replace(",", "")));
  check("“Add to calendar” beside the appointment: Google, Outlook, Apple",
    body.includes("Add to calendar") && body.includes("https://calendar.google.com/calendar/render?") && body.includes("https://outlook.office.com/calendar/") && /\/sheet\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/appointment\.ics/.test(body));
  check("the address is a Google Maps link", body.includes("https://www.google.com/maps/search/?api=1&query=12%20Main%20St%2C%20Phoenix%20AZ%2085004"));
  check("the SIC code with what it means", body.includes("SIC code: 1731 – Electrical Work"), body.match(/SIC code: [^\n]*/)?.[0]);
  check("Locations above Employees", /PROFILE\r?\nLocations: 3\r?\nEmployees: 14/.test(body), body.slice(body.indexOf("PROFILE"), body.indexOf("PROFILE") + 80));
  const policy = body.slice(body.indexOf("POLICY INFORMATION")).split(/\r?\n/).slice(1, 4);
  check("the agency after the policies", JSON.stringify(policy) === JSON.stringify(["Ultimate X-Date: Mar 1, 2027", "Package: Mar 1, 2027", "Agency: Garry Insurance"]), JSON.stringify(policy));

  section("Add to calendar › Apple");
  const ics = body.match(/https?:\/\/[^\s"<>]+\/appointment\.ics/)?.[0];
  const got = ics ? await fetch(`${APP_URL}${new URL(ics).pathname}`) : null;
  // Long lines continue on the next after a space: read them joined.
  const file = got ? (await got.text()).replace(/\r\n /g, "") : "";
  const span = appointmentSpan(tomorrow, "10:00 AM", 30, "America/Phoenix");
  const at = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  check("the .ics opens without signing in, a calendar file", got?.status === 200 && /text\/calendar/.test(got.headers.get("content-type") ?? ""), `${got?.status}`);
  check("…at 10:00 AM on the business's clock, for 30 minutes", file.includes(`DTSTART:${at(span.start)}`) && file.includes(`DTEND:${at(span.end)}`), file);
  check("…with the address and the note for the client, not the internal ones", file.includes("LOCATION:12 Main St\\, Phoenix AZ 85004") && file.includes("Appt set with Daniel and Henry") && !/INTERNAL|OLD-HISTORY/.test(file));
  check("a made-up link gets no calendar file", (await fetch(`${APP_URL}/sheet/AAAA.BBBB/appointment.ics`)).status === 404);

  section("In the app, for the client");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage();
  await client.go(`/leads/${lead}`, 4000);
  const html = await client.ev("document.documentElement.outerHTML");
  check("the client cannot open the lead page, with its notes", /don't have access/.test(html) && !/INTERNAL-SECRET|OLD-HISTORY|INTERNAL-CALL-NOTE/.test(html));
  const apptId = sql(`select id from public.appointments where lead_id = ${lead} order by id desc limit 1`);
  sql(`update public.appointments set qa_status = 'passed' where id = ${apptId}`);
  await client.go(`/calendar?view=day&d=${tomorrow}&a=${apptId}`, 4000);
  await until(() => client.ev(`!!document.querySelector('[data-focused-appointment]')`));
  await client.ev(`document.querySelector('[data-focused-appointment]').click()`);
  check("the calendar's appointment shows what was written for them", Boolean(await until(() => client.ev(`document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(NOTE)})`))));
  check("…and nothing internal", !/INTERNAL-SECRET|OLD-HISTORY|INTERNAL-CALL-NOTE/.test(await client.ev("document.documentElement.outerHTML")));

  section("For staff: the lead's Business tab");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  await admin.go(`/leads/${lead}`, 4000);
  await admin.click('[role=tab][data-tab="notes"]');
  const staffNotes = await admin.ev(`document.querySelector('[data-tab-panel="notes"]').innerText`);
  check("staff see the internal notes, marked so", /Internal notes[\s\S]*INTERNAL-SECRET/.test(staffNotes) && /Old system notes[\s\S]*OLD-HISTORY/.test(staffNotes), staffNotes);
  await admin.click("button", "Edit");
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] input[name="ein"]')`));
  await admin.fill('[role=dialog] input[name="ein"]', "1234");
  await admin.click("[role=dialog] button[type=submit]");
  const einError = await until(() => admin.ev(`[...document.querySelectorAll('[role=dialog] [role=alert]')].map((a) => a.textContent).join(' ') || null`));
  check("an EIN that is not 9 digits is refused", /9 digits/.test(einError ?? ""), einError);
  await admin.fill('[role=dialog] input[name="ein"]', "123456789");
  await admin.click("[role=dialog] button[type=submit]");
  check("…a good one is saved, written one way", Boolean(await until(() => sql(`select ein from public.leads where id = ${lead}`) === "12-3456789")));
  check("…and the internal notes are still there", sql(`select notes_dcm from public.lead_notes where lead_id = ${lead}`) === "INTERNAL-SECRET owner is hard");
  await admin.go(`/leads/${lead}`, 4000);
  const business = await admin.ev(`[...document.querySelectorAll('[data-tab-panel="business"] .grid')].map((r) => [...r.children].map((c) => c.innerText.trim()))`);
  const labels = business.map((r) => r[0]);
  const value = (label) => business.find((r) => r[0] === label)?.[1];
  check("Locations above Employees", labels.indexOf("Locations") === labels.indexOf("Employees") - 1 && value("Locations") === "3", JSON.stringify(labels));
  check("EIN between Sales volume and Years in business", labels.indexOf("EIN") === labels.indexOf("Sales volume") + 1 && labels.indexOf("Years in business") === labels.indexOf("EIN") + 1 && value("EIN") === "12-3456789", JSON.stringify(business));
  check("the SIC code with what it means", value("SIC code") === "1731 – Electrical Work", value("SIC code"));

  section("The appointment form's “For the client”");
  await admin.click("button", "Appointment");
  const prefilled = await until(() => admin.ev(`document.querySelector('[role=dialog] textarea[data-client-note]')?.value ?? null`));
  check("it starts from the lead's note, and can be edited", prefilled === NOTE, prefilled);
  await admin.fill("[role=dialog] textarea[data-client-note]", "Appt moved to Monday, same people");
  await admin.fill('[role=dialog] input[name="appt_date"]', tomorrow);
  await admin.click("[role=dialog] button[type=submit]");
  check("…saved as the lead's note for the client", Boolean(await until(() => sql(`select client_note from public.leads where id = ${lead}`) === "Appt moved to Monday, same people")));
  await sleep(500);
} finally {
  browser.close();
  await mail.close();
  sql(`update public.app_settings set value = ${lit(mailSetting)}::jsonb where key = 'mail'`);
  sql(`update public.users set company_id=${clientCompany} where id=${CLIENT_USER}`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.pay_events where lead_id = ${lead}`);
  sql(`delete from public.lead_deliveries where lead_id = ${lead}`);
  sql(`delete from public.appointments where lead_id = ${lead}`);
  sql(`delete from public.call_records where lead_id = ${lead}`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.project_assignments where project_id = ${APPT}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("lead sheet");
