/**
 * News of an appointment, emailed to the client (Sean, Oct 2026): a manager
 * recording Appointment-Confirmed sends the lead sheet again, as
 * "Appointment - <company> (CONFIRMED)"; Appointment-Invalid sends it as
 * "(CANCELLED)", the appointment marked so and nothing to add to a calendar.
 * The Client notes written with each go with it. Sending it again by hand
 * sends the latest.
 *
 * Needs the app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525, as the
 * delivery test does. Removes everything it made.
 *
 *   node tests/run.mjs tests/e2e/appointment-notices.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";

const RUN = Date.now();
const TAG = `AN-TEST ${RUN}`;
const TO = `appts.${RUN}@capital.test`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const resultId = (name) => sql(`select id from public.call_results where project_type = 'APPT' and name = ${lit(name)}`);
const mailSetting = sql("select value::text from public.app_settings where key = 'mail'");
sql(`update public.app_settings set value = value || '{"from": "alerts@signaturemktg.net"}'::jsonb where key = 'mail'`);
const inDays = (n) => sql(`select ((now() at time zone public.business_tz())::date + ${n})::text`);

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, email) values (${lit(`${TAG} Appointments`)}, ${company}, ${typeId("APPT")}, 1, ${lit(TO)}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${SEAN})`);
const COMPANY = `${TAG} Delta Door and Components LLC`;
const lead = Number(sql(`insert into public.leads (company_name, contact_name, phone, city, state, project_id, assigned_user_id, stage, result_id)
  values (${lit(COMPANY)}, 'Dana', '602-555-0144', 'Phoenix', 'AZ', ${APPT}, ${SEAN}, 'appt', ${resultId("Appointment")}) returning id`));
sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${lead}, '2027-02-01')`);
sql(`insert into public.appointments (lead_id, user_id, project_id, set_stage, appt_date, appt_time, duration_min, rep_name, status_id, qa_status)
  values (${lead}, ${SEAN}, ${APPT}, 'appt', ${lit(inDays(3))}, '10:00 AM', 30, 'Bret Godsey', (select id from public.appointment_statuses where name = 'Scheduled'), 'passed')`);

const mail = await startMailCatcher(2525);
const browser = await launchBrowser();
const sent = () => mail.messages.filter((m) => m.to.includes(TO));
const plain = (m) => m.raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const pick = (page, name) => page.ev(`(() => { const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === ${JSON.stringify(name)}); if (!b) return false; b.click(); return true; })()`);
const record = async (page, result, note) => {
  await page.go(`/leads/${lead}`, 4000);
  check(`${result} is offered`, Boolean(await until(() => pick(page, result))));
  await until(() => page.ev(`!!document.querySelector('[data-client-note]')`));
  const hint = await page.ev(`document.querySelector('[data-client-note]').closest('div').parentElement.innerText`);
  await page.fill("[data-client-note]", note);
  await page.click("button", "Save:");
  return hint;
};

try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1400, height: 1000 });

  section("Confirmed");
  const hint = await record(sean, "Appointment-Confirmed", "Confirmed with Dana; bring the dec pages");
  check("the Client notes box is there for it, saying the client is emailed", /CONFIRMED/.test(hint ?? ""), hint);
  check("the lead sheet is emailed to the client again", Boolean(await until(() => sent().length === 1, { timeout: 15000 })), JSON.stringify(mail.messages.map((m) => m.to)));
  const confirmed = sent()[0];
  check("…as “Appointment - <company> (CONFIRMED)”", confirmed?.headers.subject === `Appointment - ${COMPANY} (CONFIRMED)`, confirmed?.headers.subject);
  const body = confirmed ? plain(confirmed) : "";
  check("…marked confirmed, with the note and the appointment to add to a calendar",
    body.includes("APPOINTMENT CONFIRMED") && body.includes("Confirmed with Dana; bring the dec pages") && body.includes("10:00 AM") && /Add to calendar/.test(body), body.slice(body.indexOf("LEAD SHEET"), body.indexOf("LEAD SHEET") + 1500));
  check("…and kept on the lead", sql(`select string_agg(result || ':' || status, ',') from public.lead_deliveries where lead_id = ${lead}`) === "Appointment-Confirmed:sent");

  section("Cancelled");
  await record(sean, "Appointment-Invalid", "Cancelled: the owner is out of town until next month");
  check("the client is emailed again", Boolean(await until(() => sent().length === 2, { timeout: 15000 })));
  const cancelled = sent()[1];
  check("…as “Appointment - <company> (CANCELLED)”", cancelled?.headers.subject === `Appointment - ${COMPANY} (CANCELLED)`, cancelled?.headers.subject);
  const cbody = cancelled ? plain(cancelled) : "";
  check("…the appointment shown cancelled, with the reason, and nothing to add to a calendar",
    cbody.includes("APPOINTMENT CANCELLED") && /10:00 AM \(CANCELLED\)/.test(cbody) && cbody.includes("out of town until next month") && !/Add to calendar/.test(cbody), cbody.slice(0, 400));

  section("Sent again by hand");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  await admin.go(`/leads/${lead}`, 4000);
  await admin.click('[role=tab][data-tab="deliveries"]');
  await admin.click("[data-resend-delivery]");
  check("“Send to client again” sends the latest: cancelled", Boolean(await until(() => sent().length === 3, { timeout: 15000 })) && sent()[2]?.headers.subject === `Appointment - ${COMPANY} (CANCELLED)`, sent()[2]?.headers.subject);
} finally {
  browser.close();
  await mail.close();
  sql(`update public.app_settings set value = ${lit(mailSetting)}::jsonb where key = 'mail'`);
  sql(`delete from public.lead_deliveries where lead_id = ${lead}`);
  sql(`delete from public.pay_events where lead_id = ${lead}`);
  sql(`delete from public.call_records where lead_id = ${lead}`);
  sql(`delete from public.appointments where lead_id = ${lead}`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.insurance_details where lead_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}
finish("appointment notices");
