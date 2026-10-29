/**
 * Call back later, on the lead sheet (Sean, Oct 2026): a lead whose
 * appointment was found invalid ("no time this year, call next year") is put
 * back on its project's list on a later day, 90 days before its next renewal
 * unless changed, with why; the sheet then says when. Not offered on a lead
 * with no invalid appointment.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/invalid-callback.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `IC-E2E ${Date.now()}`;
const MIKE = Number(sql(`select id from public.users where email = 'mike@beacon.test'`));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appointment_rate)
  values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1, 40) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${MIKE})`);
const result = (name) => sql(`select id from public.call_results where project_type = 'APPT' and name = ${lit(name)}`);
const newName = (name) => Number(sql(`insert into public.leads (company_name, project_id, stage, assigned_user_id, result_id)
  values (${lit(`${TAG} ${name}`)}, ${APPT}, 'appt', ${MIKE}, ${result("Lead-No Contact")}) returning id`));
const invalid = newName("Invalid");
const plain = newName("Plain");
sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${invalid}, '2025-03-01')`);
const mike = await signIn("mike@beacon.test");
const record = (name, appointment = null) => mike.sb.rpc("record_call_result", {
  p_lead_id: invalid, p_result_id: Number(result(name)), p_notes: null, p_appointment: appointment, p_corrected_xdate: null, p_ultimate_xdate: null,
});
const tomorrow = sql("select (public.business_today() + 1)::text");
await record("Appointment", { date: tomorrow, time: "10:30 AM", duration: 45, rep_name: "Bret Godsey" });
await record("Appointment-Invalid");
const now = (id) => sql(`select r.name || '|' || coalesce(l.call_back_on::text, '') from public.leads l join public.call_results r on r.id = l.result_id where l.id = ${id}`);
// Its renewal next Mar 1 (on file as last year's): called back 90 days before.
const RENEWAL = sql(`select make_date(extract(year from public.business_today())::int + case when public.business_today() < make_date(extract(year from public.business_today())::int, 3, 1) - 90 then 0 else 1 end, 3, 1)::text`);
const BACK_ON = sql(`select (${lit(RENEWAL)}::date - 90)::text`);

const browser = await launchBrowser();
try {
  const page = await (await browser.newContext({ as: "mike@beacon.test" })).newPage({ width: 1400, height: 1000 });

  section("Not on a lead with no invalid appointment");
  await page.go(`/leads/${plain}`, 6000);
  check("no Call back later", !(await page.ev("Boolean(document.querySelector('[data-call-back-later]'))")));

  section("An invalid appointment's lead");
  check("recorded invalid", now(invalid).startsWith("Appointment-Invalid|"), now(invalid));
  await page.go(`/leads/${invalid}`, 6000);
  check("Call back later offered", Boolean(await until(() => page.ev("Boolean(document.querySelector('[data-call-back-later]'))"))));
  await page.click("[data-call-back-later]");
  await until(() => page.ev("Boolean(document.querySelector('[data-call-back-dialog]'))"));
  check("…it says from which renewal", await page.ev(`document.querySelector('[data-call-back-dialog]').textContent.includes('90 days before its renewal')`));
  check("…90 days before its next renewal to begin with", await page.ev(`document.querySelector('[data-call-back-dialog] input[name="on"]').value`) === BACK_ON,
    await page.ev(`document.querySelector('[data-call-back-dialog] input[name="on"]').value`));
  await page.fill("[data-call-back-note]", "No time this year, call in the new year");
  await page.click("[data-call-back-save]");
  const said = await page.waitToast(/Back on the call list/, 10000);
  check("it says when", Boolean(said), said);
  check("Lead-Not Shopping, to call back on that day", Boolean(await until(() => now(invalid) === `Lead-Not Shopping|${BACK_ON}`)), now(invalid));
  check("the sheet says when it comes back", Boolean(await until(() => page.ev(`document.querySelector('[data-call-back-on]')?.dataset.callBackOn === ${JSON.stringify(BACK_ON)}`))));
  check("…and no longer offers it", !(await page.ev("Boolean(document.querySelector('[data-call-back-later]'))")));
  check("why, in its notes", /Call back on .*No time this year/.test(sql(`select coalesce(notes, '') from public.lead_notes where lead_id = ${invalid}`)));
} finally {
  browser.close();
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("invalid callback (lead sheet)");
