/**
 * An appointment shows as its call result says (Sean, Oct 2026): Appointment,
 * Appointment-Phone or Appointment-Confirmed, on the manager's dashboard
 * calendar and on the Calendar page; never the old system's lead status
 * ("Survey appointment").
 *
 * Removes everything it made.
 *
 *   node tests/run.mjs tests/e2e/appointment-kind.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `AK ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const today = sql("select ((now() at time zone public.business_tz())::date)::text");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code='APPT'), 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${SEAN})`);
// Its old status still says Survey appointment; its call result is Appointment-Phone.
const lead = Number(sql(`insert into public.leads (company_name, contact_name, project_id, assigned_user_id, status_id, result_id)
  values (${lit(`${TAG} Parkview Car Wash`)}, 'Dana Reyes', ${APPT}, ${SEAN}, (select id from public.lead_statuses where code='survey'),
          (select id from public.call_results where project_type='APPT' and name='Appointment-Phone')) returning id`));
sql(`insert into public.appointments (lead_id, user_id, project_id, appt_date, appt_time, qa_status) values (${lead}, ${SEAN}, ${APPT}, ${lit(today)}, '10:00 AM', 'passed')`);

const browser = await launchBrowser();
try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1500, height: 1100 });
  const line = (sel) => sean.ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => e.innerText.replace(/\\s+/g, ' ')).find((t) => t.includes(${JSON.stringify(TAG)})) ?? null`);

  section("The manager's dashboard calendar");
  await sean.go("/", 6000);
  const mine = await until(() => line("[data-my-schedule] li, [data-my-schedule] [data-item], [data-my-schedule] a"), { timeout: 8000 });
  check("Appointment-Phone, as its call result says", /Appointment-Phone/.test(mine ?? "") && !/Survey/i.test(mine ?? ""), mine);

  section("The Calendar page");
  await sean.go(`/calendar?project=${APPT}&view=month&d=${today}`, 6000);
  const day = await until(() => line("[data-list-row]"), { timeout: 8000 });
  check("…there too", /Appointment-Phone/.test(day ?? "") && !/Survey/i.test(day ?? ""), day);
} finally {
  browser.close();
  sql(`delete from public.notifications where body like ${lit(`%${TAG}%`)} or title like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.appointments where project_id = ${APPT}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.project_assignments where project_id = ${APPT}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("appointment kind");
