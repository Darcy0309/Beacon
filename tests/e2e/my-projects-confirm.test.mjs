/**
 * A manager's My Projects (Sean, Oct 2026): each appointment to confirm reads
 * its project, time zone, when it was set and when it is, marked To Confirm;
 * it brings a reminder for 9:00 AM the day before (moved with it, gone once
 * confirmed); and each project opens a quick look at its Project Info.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `MPC-TEST ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const PST = sql("select id from public.timezones where name = 'PST'");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, timezone_id) values (${lit(`${TAG} Appts`)}, ${company}, ${typeId("APPT")}, 1, ${PST}) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, timezone_id)
  values (${lit(`${TAG} Maricopa DBDev`)}, ${company}, ${typeId("DBDV")}, 1, ${APPT}, ${PST}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${SEAN})`);
sql(`insert into public.project_profiles (project_id, min_employees, avoid_days, states_licensed) values (${APPT}, 5, '{1}', '{AZ}')`);
const LEAD = Number(sql(`insert into public.leads (company_name, contact_name, phone, project_id, assigned_user_id) values (${lit(`${TAG} Desert Plumbing`)}, 'Dana', '602-555-0144', ${APPT}, ${SEAN}) returning id`));
const DAY = sql("select ((now() at time zone public.business_tz())::date + 3)::text");
const APPT_ID = Number(sql(`insert into public.appointments (lead_id, user_id, project_id, set_project_id, appt_date, appt_time, qa_status)
  values (${LEAD}, ${SEAN}, ${APPT}, ${DBDV}, '${DAY}', '10:00 AM', 'pending') returning id`));
const reminder = () => sql(`select coalesce((select to_char(remind_at at time zone public.business_tz(), 'YYYY-MM-DD HH24:MI') from public.reminders where appointment_id = ${APPT_ID} and sent_at is null), '')`);

const browser = await launchBrowser();
try {
  section("The reminder the day before");
  const dayBefore = sql(`select ('${DAY}'::date - 1)::text`);
  check("set for 9:00 AM the day before", reminder() === `${dayBefore} 09:00`, reminder());

  section("Appointments to Confirm");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 950 });
  await sean.go("/work", 4000);
  const row = await until(() => sean.ev(`(() => { const r = [...document.querySelectorAll('[data-list-row]')].find((x) => x.innerText.includes(${JSON.stringify(`${TAG} Desert Plumbing`)}));
    return r ? { project: r.querySelector('[data-follow-up-project]')?.textContent, zone: r.querySelector('[data-follow-up-zone]')?.textContent,
      set: r.querySelector('[data-follow-up-set]')?.textContent, when: r.querySelector('[data-follow-up-when]')?.textContent,
      confirm: r.querySelector('[data-to-confirm]')?.textContent, qa: /QA (passed|pending)/i.test(r.innerText) } : null; })()`));
  check("the row reads the project it was set on, its time zone, when it was set and when it is", row?.project?.includes(`${TAG} Maricopa DBDev`)
    && row.zone === "PST" && /Set/.test(row.set) && /Appointment/.test(row.when) && /10:00 AM/.test(row.when), JSON.stringify(row));
  check("…marked To Confirm, not its QA", row?.confirm === "To Confirm" && !row.qa, JSON.stringify(row));

  section("A quick look at the Project Info");
  check("each project has its Project Info link", Boolean(await sean.ev(`!!document.querySelector('[data-project-info-glance="${DBDV}"]')`)));
  await sean.click(`[data-project-info-glance="${DBDV}"]`);
  const text = await until(() => sean.ev(`(() => { const d = document.querySelector('[data-project-info-glance-dialog]'); return d && d.querySelector('[data-project-info]') ? d.innerText : null; })()`), { timeout: 8000 });
  check("…opens it: the fewest employees, the days to avoid (the appointment project's, shared)", /Minimum employees\s*5/.test(text ?? "") && /Mondays/.test(text ?? ""), (text ?? "").slice(0, 300));

  section("Moved, then confirmed");
  sql(`update public.appointments set appt_date = appt_date + 2 where id = ${APPT_ID}`);
  check("moved: the reminder moves with it", reminder() === sql(`select ('${DAY}'::date + 1)::text || ' 09:00'`), reminder());
  sql(`update public.appointments set confirmed_at = now() where id = ${APPT_ID}`);
  check("confirmed: no reminder left", reminder() === "");
} finally {
  browser.close();
  const like = lit(`${TAG}%`);
  sql(`delete from public.reminders where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.project_profiles where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.project_assignment_log where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.notifications where link in ('/work/${DBDV}', '/work/${APPT}')`);
  sql(`update public.projects set appt_project_id = null where id = ${DBDV}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("my projects confirm");
