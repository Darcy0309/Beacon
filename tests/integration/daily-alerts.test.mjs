/**
 * The morning alerts that used to say "not sending yet": the X-date 30-day
 * warning (each rep, of the names they hold renewing in 30 days; a name
 * nobody holds goes to its project's reps) and the appointment reminder
 * (whoever set them, of the day's appointments and tomorrow's still to
 * confirm). Once a day each; switching a rule off stops it.
 *
 * Uses a day far ahead (2031) so no seeded name or appointment falls on it,
 * and removes everything it made.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `DA-TEST ${Date.now()}`;
const DAY = "2031-01-02";
const DUE = "2031-02-01"; // DAY + 30
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${project}, ${MIKE})`);
const name = (co, rep, xdate, result = null) => {
  const id = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id, result_id)
    values (${lit(`${TAG} ${co}`)}, ${project}, ${rep ?? "null"}, ${result ? `(select id from public.call_results where project_type='DBDV' and name=${lit(result)})` : "null"}) returning id`));
  sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${id}, ${lit(xdate)})`);
  return id;
};
// Only the morning alerts: adding names and appointments sends "Lead assigned" and "Appointment set" too.
const TITLE = { lead: "X-date", appointment: "(today|to confirm for tomorrow)$" };
const notes = (user, rule) => JSON.parse(sql(`select coalesce(json_agg(json_build_object('title', title, 'body', body, 'link', link)), '[]')
  from public.notifications where user_id = ${user} and (title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}) and kind = ${lit(rule)}
   and title ~ ${lit(TITLE[rule])}`));
const run = (fn) => Number(sql(`select public.${fn}(${lit(DAY)}::date)`));

try {
  section("X-date 30-day warning");
  const solo = name("Sine Wave", SEAN, DUE);
  name("Off The List Co", SEAN, DUE, "Not Interested");
  const unheld = name("Nobody Holds It", null, DUE);
  name("Too Soon Co", SEAN, "2031-01-20");
  run("send_xdate_warnings");
  const sean = notes(SEAN, "lead");
  check("the rep hears of the name renewing in 30 days, linked to it",
    sean.length === 1 && sean[0].title === `X-date in 30 days: ${TAG} Sine Wave` && sean[0].link === `/leads/${solo}` && /Renewing Feb 1/.test(sean[0].body), JSON.stringify(sean));
  check("…not of one off the list, nor of one renewing another day", !JSON.stringify(sean).includes("Off The List") && !JSON.stringify(sean).includes("Too Soon"));
  const mike = notes(MIKE, "lead");
  check("a name nobody holds goes to its project's rep", mike.length === 1 && mike[0].link === `/leads/${unheld}`, JSON.stringify(mike));
  run("send_xdate_warnings");
  check("once a day: running again sends nothing", notes(SEAN, "lead").length === 1);

  sql(`delete from public.alert_sends where key like '%:${DAY}'`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  name("Second Church", SEAN, DUE);
  run("send_xdate_warnings");
  const digest = notes(SEAN, "lead");
  check("several names: one notification, how many and which, to the call lists",
    digest.length === 1 && digest[0].title === "2 X-dates in 30 days" && digest[0].body.includes("Second Church") && digest[0].body.includes("Sine Wave") && digest[0].link === "/work",
    JSON.stringify(digest));

  section("Appointment reminder");
  const appt = (lead, date, confirmed = false, status = "Scheduled") =>
    sql(`insert into public.appointments (lead_id, user_id, appt_date, appt_time, status_id, confirmed_at)
      values (${lead}, ${SEAN}, ${lit(date)}, '10:00 AM', (select id from public.appointment_statuses where name=${lit(status)}), ${confirmed ? "now()" : "null"})`);
  appt(solo, DAY);
  appt(unheld, "2031-01-03");
  appt(name("Confirmed Co", SEAN, "2031-06-01"), "2031-01-03", true);
  appt(name("Cancelled Co", SEAN, "2031-06-01"), DAY, false, "Cancelled");
  run("send_appointment_reminders");
  const reminder = notes(SEAN, "appointment");
  check("whoever set them hears of today's appointments and tomorrow's still to confirm",
    reminder.length === 1 && reminder[0].title === "1 appointment today, 1 to confirm for tomorrow"
    && reminder[0].body.includes(`Today: 10:00 AM ${TAG} Sine Wave`) && reminder[0].body.includes(`Confirm: ${TAG} Nobody Holds It`), JSON.stringify(reminder));
  check("…not a confirmed one, nor a cancelled one", !reminder[0]?.body.includes("Confirmed Co") && !reminder[0]?.body.includes("Cancelled Co"));
  check("…linked to that day on the calendar", reminder[0]?.link === `/calendar?view=day&d=${DAY}`);
  run("send_appointment_reminders");
  check("once a day", notes(SEAN, "appointment").length === 1);

  section("Switched off");
  sql(`delete from public.alert_sends where key like '%:${DAY}'`);
  sql(`delete from public.notifications where (title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)})`);
  sql("update public.alert_rules set enabled = false where trigger in ('xdate_30d', 'appt_reminder')");
  run("send_xdate_warnings");
  run("send_appointment_reminders");
  check("a rule switched off on the Alerts page sends nothing", notes(SEAN, "lead").length === 0 && notes(SEAN, "appointment").length === 0);
  check("pg_cron runs them every hour", sql("select schedule from cron.job where jobname = 'daily-alerts'") === "5 * * * *");
} finally {
  sql("update public.alert_rules set enabled = true where trigger in ('xdate_30d', 'appt_reminder')");
  sql(`delete from public.alert_sends where key like '%:${DAY}'`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)} or title like '%X-dates in 30 days'`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where project_id = ${project})`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("daily alerts");
