/**
 * Clients update their appointments (Sean, Oct 2026): their Appointments
 * list as Recent Activity has it, with each one's Update Status; the update
 * window (one status, a stamped note, a potential premium while quoting,
 * each sold line's premium and carrier); the history on the lead for
 * administrators and managers, their notifications, and Appointment Updates;
 * the reminders on the 2nd and 4th business day (notification and email);
 * the Sale Pipeline from the project's start, all projects or one; and the
 * client's lead page: Remind Me, the Call Result and the project calendar.
 *
 * Needs the app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (any
 * SMTP_USER and SMTP_PASSWORD) and PUSH_DELIVER_SECRET=lighthouse-local-flush-test.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";
import { APP_URL } from "../support/env.mjs";

const SECRET = process.env.TEST_PUSH_SECRET ?? "lighthouse-local-flush-test";
const TAG = `AU-TEST ${Date.now()}`;
const CLIENT = Number(sql("select id from public.users where email='client@beacon.test'"));
const ADMIN = Number(sql("select id from public.users where email='admin@beacon.test'"));
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT}`);
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const today = sql("select (now() at time zone public.business_tz())::date");
// The reminders' day: the latest weekday up to today, at 10 AM (in the past, or this morning).
const nudgeDay = sql(`select max(d)::date from generate_series('${today}'::date - 6, '${today}'::date, interval '1 day') d where extract(isodow from d) < 6`);
const businessBack = (n) => sql(`select d::date from generate_series('${nudgeDay}'::date - 14, '${nudgeDay}'::date - 1, interval '1 day') d
  where extract(isodow from d) < 6 and public.business_days_after(d::date, ${n}) = '${nudgeDay}'::date order by d desc limit 1`);
const startMonth = sql(`select (date_trunc('month', '${today}'::date) - interval '3 months')::date`);

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const P1 = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, start_date)
  values (${lit(`${TAG} Churches`)}, ${company}, ${typeId("APPT")}, 1, '${startMonth}'::date + 4) returning id`));
const P2 = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, start_date)
  values (${lit(`${TAG} Contractors`)}, ${company}, ${typeId("APPT")}, 1, '${startMonth}'::date + 40) returning id`));
sql(`update public.users set company_id = ${company} where id = ${CLIENT}`);
const appt = sql("select id from public.call_results where project_type = 'APPT' and name = 'Appointment'");
const lead = (name, p) => Number(sql(`insert into public.leads (company_name, project_id, result_id, stage, city, state) values (${lit(`${TAG} ${name}`)}, ${p}, ${appt}, 'appt', 'Mesa', 'AZ') returning id`));
const L1 = lead("Fusion Air", P1);
const L2 = lead("Desert Roofing", P1);
const L3 = lead("Valley Plumbing", P2);
const L4 = lead("Sunrise Dental", P1);
const book = (l, p, day, time = "10:00 AM") => Number(sql(`insert into public.appointments (lead_id, project_id, set_project_id, user_id, appt_date, appt_time, qa_status, rep_name)
  values (${l}, ${p}, ${p}, ${SEAN}, '${day}', ${lit(time)}, 'passed', 'Bret Godsey') returning id`));
const A1 = book(L1, P1, businessBack(2));               // gone by: No Status, its 1st reminder due
const A2 = book(L2, P1, sql(`select '${today}'::date + 5`)); // still to come: Pending Appointment
const A3 = book(L3, P2, businessBack(4));               // gone by long enough for the 2nd reminder
const A4 = book(L4, P1, businessBack(2));               // a second gone by, to update to Invalid
sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${L1}, '${today}'::date + 40)`);
const carrier = sql("select name from public.agencies where deleted_at is null and name is not null order by name limit 1");

const mail = await startMailCatcher(2525);
const browser = await launchBrowser();
// The update link in an email, quoted-printable or not ("=" is "=3D" there; long lines break with "=").
const linkTo = (m) => new RegExp(`/appointments\\?update(=|=3D)${A3}\\b`).test(String(m.raw ?? "").replace(/=\r?\n/g, ""));
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });
const row = (page, id) => page.ev(`document.querySelector('[data-client-appt="${id}"]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
try {
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1440, height: 950 });
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 950 });

  section("The client's Appointments, as Recent Activity has them");
  await client.go("/appointments", 5000);
  await when(client, `!!document.querySelector('[data-client-appt="${A1}"]')`);
  const r1 = await row(client, A1);
  check("company, project, agent, appointment, status, X-date and the manager who set it", r1.includes("Fusion Air") && r1.includes(`${TAG} Churches`)
    && r1.includes("Bret Godsey") && r1.includes("Sean") && /Appointment/.test(r1), r1);
  check("…gone by and not updated: No Status, due in 5 business days", /No Status/.test(r1) && /Due by|Overdue/.test(r1), r1);
  check("…still to come: Pending Appointment", /Pending Appointment/.test(await row(client, A2)), await row(client, A2));
  check("the company opens its lead sheet, not the calendar", (await client.ev(`document.querySelector('[data-client-appt="${A1}"] [data-appt-lead]')?.getAttribute('href')`))?.startsWith(`/leads/${L1}`));
  await client.go(`/appointments?project=${P2}`, 4000);
  check("the project filter narrows it", Boolean(await when(client, `!!document.querySelector('[data-client-appt="${A3}"]') && !document.querySelector('[data-client-appt="${A1}"]')`)));

  section("Update status: Valid-Quoting, with a potential premium");
  await client.go("/appointments", 5000);
  await when(client, `!!document.querySelector('[data-update-status="${A1}"]')`);
  await client.click(`[data-update-status="${A1}"]`);
  await when(client, `!!document.querySelector('[data-update-dialog="${A1}"]')`);
  check("nine statuses to choose one from", (await client.ev("document.querySelectorAll('[data-status-option]').length")) === 9);
  check("…no notes box until one is chosen", !(await client.ev("!!document.querySelector('[data-update-note]')")));
  await client.click('[data-status-option="valid_quoting"]');
  check("Valid-Quoting asks for the potential premium, and notes", Boolean(await when(client, "!!document.querySelector('[data-potential-premium]') && !!document.querySelector('[data-update-note]')")));
  await client.fill("[data-potential-premium]", "25,000");
  await client.ev("document.querySelector('[data-update-note]').focus(), true");
  const stamped = await client.ev("document.querySelector('[data-update-note]').value");
  await client.fill("[data-update-note]", `${stamped}${TAG} Quoting GL and WC, need loss runs`);
  await client.click("[data-save-update]", "Save");
  await until(() => sql(`select coalesce(client_result, '') from public.appointments where id = ${A1}`) === "valid_quoting" || null, { timeout: 10000 });
  check("saved: Valid-Quoting at $25,000", sql(`select client_result || ' ' || quoted_premium::int from public.appointments where id = ${A1}`) === "valid_quoting 25000");
  const note = sql(`select note from public.appointment_updates where appointment_id = ${A1} order by id desc limit 1`);
  check("…its note kept, stamped with the day and their name", note.includes("need loss runs") && note.length > `${TAG} Quoting GL and WC, need loss runs`.length, note);
  check("…the administrators and the manager who set it are told", sql(`select count(distinct user_id) from public.notifications where link = '/leads/${L1}?tab=updates' and title like 'Appointment update: Valid-Quoting%' and user_id in (${ADMIN}, ${SEAN})`) === "2");
  check("…and the row shows it", Boolean(await when(client, `/Valid-Quoting/.test(document.querySelector('[data-client-appt="${A1}"]')?.innerText ?? '') && /\\$25,000/.test(document.querySelector('[data-client-appt="${A1}"]')?.innerText ?? '')`)));

  section("Sold Account: each line's premium and carrier, and the total");
  await client.click(`[data-update-status="${A1}"]`);
  await when(client, `!!document.querySelector('[data-update-dialog="${A1}"]')`);
  await client.click('[data-status-option="sold"]');
  check("the seven policy lines, each with a carrier to choose", Boolean(await when(client, "document.querySelectorAll('[data-sold-line]').length === 7")));
  await client.fill('[data-line-premium="liability"]', "10,000");
  await client.fill('[data-line-carrier="liability"]', carrier);
  await client.fill('[data-line-premium="auto"]', "2,500");
  await client.click("[data-save-update]", "Save");
  check("a line without its carrier is refused", Boolean(await until(() => client.ev("!!document.querySelector('[data-sold-lines] .text-destructive')"), { timeout: 8000 }))
    && sql(`select client_result from public.appointments where id = ${A1}`) === "valid_quoting");
  await client.fill('[data-line-carrier="auto"]', carrier);
  check("the total adds up as they type", /\$12,500/.test(await client.ev("document.querySelector('[data-total-premium]')?.innerText ?? ''")));
  await client.click("[data-save-update]", "Save");
  await until(() => sql(`select coalesce(client_result, '') from public.appointments where id = ${A1}`) === "sold" || null, { timeout: 10000 });
  check("saved: Sold Account, $12,500 written over two lines", sql(`select written_premium::int || ' ' || jsonb_array_length(sold_lines) from public.appointments where id = ${A1}`) === "12500 2");
  check("…and the window closes", Boolean(await when(client, `!document.querySelector('[data-update-dialog="${A1}"]')`, 8000)));

  // A second one: Invalid, said in time for the credit.
  await client.click(`[data-update-status="${A4}"]`);
  await when(client, `!!document.querySelector('[data-update-dialog="${A4}"]')`);
  await client.click(`[data-update-dialog="${A4}"] [data-status-option="invalid"]`);
  await client.click(`[data-update-dialog="${A4}"] [data-save-update]`, "Save");
  await until(() => sql(`select coalesce(client_result, '') from public.appointments where id = ${A4}`) === "invalid" || null, { timeout: 10000 });
  check("an Invalid one, in time", sql(`select client_result from public.appointments where id = ${A4}`) === "invalid");

  section("Their dashboard: results and the Sale Pipeline");
  await client.go("/", 6000);
  const results = await when(client, `Object.fromEntries([...document.querySelectorAll('[data-client-result]')].map((r) => [r.dataset.clientResult, r.innerText.replace(/\\s+/g, ' ')]))`);
  check("Appointment Results in the nine statuses", /Sold Account 1/.test(results?.sold ?? "") && /Pending Appointment 1/.test(results?.pending_appointment ?? "")
    && /Invalid 1/.test(results?.invalid ?? ""), JSON.stringify(results));
  const startLabel = sql(`select to_char('${startMonth}'::date, 'Mon')`);
  const months = await client.ev("[...document.querySelectorAll('[data-sale-pipeline] .mt-1.flex span')].map((s) => s.textContent)");
  check("the Sale Pipeline starts at the campaign's start month", months?.[0] === startLabel && months.length === 12, JSON.stringify(months));
  const stat = (k) => client.ev(`document.querySelector('[data-sale-stat="${k}"]')?.innerText.replace(/\\s+/g, ' ')`);
  check("…premium written from the Sold Account total", /\$12,500/.test((await stat("written")) ?? ""), await stat("written"));
  check("…a project list: all, or one", Boolean(await client.ev("!!document.querySelector('[data-sale-pipeline] button, [data-sale-pipeline] select')")));
  await client.go(`/?sp=${P2}`, 5000);
  check("one project alone: its own start, nothing written yet", /\$0/.test((await when(client, `document.querySelector('[data-sale-stat="written"]')?.innerText`)) ?? "")
    && (await client.ev("document.querySelector('[data-sale-pipeline]')?.dataset.saleStart")) === sql(`select date_trunc('month', '${startMonth}'::date + 40)::date`));

  section("The client's lead page");
  await client.go(`/leads/${L1}`, 6000);
  check("Remind Me, for their own calendar", Boolean(await when(client, "!!document.querySelector('[data-reminders] [data-set-reminder]')")));
  const callResult = await client.ev("document.querySelector('[data-client-call-result]')?.innerText.replace(/\\s+/g, ' ') ?? ''");
  check("the Call Result: the result, the appointment's day and time, how it went", /Appointment/.test(callResult) && /10:00 AM/.test(callResult) && /Sold Account/.test(callResult), callResult);
  check("…the project calendar in view", Boolean(await client.ev("!!document.querySelector('[data-project-calendar]')")));
  check("…and not the call result buttons (Stays on my list)", !/Stays on my list/i.test(await client.ev("document.body.innerText")));
  const clientAuth = sql(`select auth_id from public.users where id = ${CLIENT}`);
  const reminder = sql(`set local role authenticated;
    select set_config('request.jwt.claims', json_build_object('sub', '${clientAuth}', 'role', 'authenticated')::text, true);
    select public.set_reminder(${L1}, '${today}'::date + 1, '9:00 AM', ${lit(TAG)})->>'id'`).split("\n").at(-1);
  check("a client may set a reminder on their own lead", /^\d+$/.test(reminder), reminder);
  sql(`delete from public.reminders where note = ${lit(TAG)}`);

  section("Administrators: the lead's history and Appointment Updates");
  await admin.go(`/leads/${L1}?tab=updates`, 6000);
  const history = (await when(admin, "document.querySelector('[data-appointment-updates]')?.innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("the lead's Appointment Updates: each update, when, by whom, with the note", /Sold Account/.test(history) && /Valid-Quoting/.test(history)
    && /need loss runs/.test(history) && /\$12,500/.test(history) && /\(client\)/.test(history), history.slice(0, 300));
  await admin.go(`/reports/appointment-updates?client=${company}`, 6000);
  const feed = (await when(admin, "document.querySelector('[data-updates-table]')?.innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("Appointment Updates lists them as they came in", (await admin.ev("document.querySelectorAll('[data-update-row]').length")) === 3
    && /Sold Account/.test(feed) && /Invalid/.test(feed), feed.slice(0, 300));

  section("Reminders to update: the 2nd and 4th business day");
  const run = sql(`select public.nudge_appointment_updates(('${nudgeDay}'::date + time '10:00') at time zone public.business_tz())`);
  const notes = sql(`select string_agg(body, ' || ' order by id) from public.notifications where user_id = ${CLIENT} and link like '/appointments?update=%' and (link = '/appointments?update=${A3}')`);
  check("the 4th day's reminder, for one still at No Status", /by tomorrow in order to receive credit if it was invalid/.test(notes), notes);
  check("…none for those already updated", sql(`select count(*) from public.notifications where user_id = ${CLIENT} and link in ('/appointments?update=${A1}', '/appointments?update=${A4}')`) === "0", run);
  check("…queued to email", sql(`select count(*) from public.appointment_nudges where appointment_id = ${A3} and nudge = 2`) === "1");
  sql(`select public.nudge_appointment_updates(('${nudgeDay}'::date + time '11:00') at time zone public.business_tz())`);
  check("…once only", sql(`select count(*) from public.appointment_nudges where appointment_id = ${A3}`) === "1");
  const res = await fetch(`${APP_URL}/api/appointments/nudge`, { method: "POST", headers: { "content-type": "application/json", "x-push-secret": SECRET }, body: "{}" }).then((r) => r.json());
  const email = await until(() => mail.messages.find((m) => m.to.some((t) => t.includes("client@beacon.test")) && linkTo(m)) ?? null, { timeout: 10000 });
  check("…and emailed, with a link to update it", Boolean(email) && linkTo(email), JSON.stringify(res));
  check("…a reminder's link opens its update", await (async () => {
    await client.go(`/appointments?update=${A3}&project=${P2}`, 5000);
    return Boolean(await when(client, `!!document.querySelector('[data-update-dialog="${A3}"]')`));
  })());
} finally {
  browser.close();
  await mail.close?.();
  const like = lit(`${TAG}%`);
  sql(`update public.users set company_id = ${clientCompany} where id = ${CLIENT}`);
  sql(`delete from public.notifications where link like '/leads/%?tab=updates' and link in (select '/leads/' || id || '?tab=updates' from public.leads where company_name like ${like})`);
  sql(`delete from public.notifications where link in ('/appointments?update=${A1}', '/appointments?update=${A2}', '/appointments?update=${A3}', '/appointments?update=${A4}')`);
  sql(`delete from public.appointment_nudges where appointment_id in (${A1}, ${A2}, ${A3}, ${A4})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.projects where id in (${P1}, ${P2})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("appointment updates");
