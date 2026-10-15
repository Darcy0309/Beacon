/**
 * Leads counted as leads, and the team's birthdays and work anniversaries
 * (Sean, Oct 2026), against the database:
 *
 *   projects_lead_stats()  a DB dev project's leads are those it developed,
 *                          an appointment project's its own; what each still
 *                          has to call; every lead once in the total
 *   user_workload          names still to call apart from leads held
 *   users                  time zone, date of birth, start date
 *   send_celebrations()    the day's birthdays and anniversaries, to every
 *                          active manager and administrator, once
 *
 * Removes everything it made.
 *
 *   node tests/integration/counts-celebrations.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `CC-TEST ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const result = (t, name) => sql(`select id from public.call_results where project_type='${t}' and name=${lit(name)}`);
const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} DBDev`)}, ${company}, ${type("DBDV")}, 1, ${APPT}) returning id`));
const name = (n, rid) => Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id, result_id) values (${lit(`${TAG} ${n}`)}, ${DBDV}, ${sean.me.id}, ${rid}) returning id`));
// Four names on the DB dev project: two still to call, one resolved, one developed into a lead.
name("A", result("DBDV", "Viable-CallBack"));
name("B", result("DBDV", "Viable-CallBack"));
name("C", result("DBDV", "Not Interested"));
const D = name("D", result("DBDV", "Viable-CallBack"));
sql(`update public.leads set project_id = ${APPT}, assigned_user_id = ${sean.me.id}, result_id = ${result("APPT", "Lead-No Contact")} where id = ${D}`);
// And one imported straight onto the appointment project.
sql(`insert into public.leads (company_name, project_id, result_id) values (${lit(`${TAG} Imported`)}, ${APPT}, ${result("APPT", "Lead-No Contact")})`);
const today = sql("select ((now() at time zone public.business_tz())::date)::text");
const MIKE = Number(sql("select id from public.users where email='mike@beacon.test'"));
const before = JSON.parse(sql(`select row_to_json(u) from (select birth_date, start_date from public.users where id = ${MIKE}) u`));

try {
  section("Leads counted as leads");
  const { data, error } = await admin.sb.rpc("projects_lead_stats");
  const of = (id) => (data ?? []).find((r) => Number(r.project_id) === id);
  check("a DB dev project's leads are the ones it developed; what it still has to call, its names", !error
    && Number(of(DBDV)?.leads) === 1 && Number(of(DBDV)?.names_left) === 2 && Number(of(DBDV)?.names) === 4, error?.message ?? JSON.stringify(of(DBDV)));
  check("an appointment project's leads are its own, imported or developed", Number(of(APPT)?.leads) === 2 && Number(of(APPT)?.leads_active) === 2, JSON.stringify(of(APPT)));
  const total = (data ?? []).find((r) => r.project_id == null);
  const leadsAll = Number(sql("select count(*) from public.leads where stage = 'appt'"));
  check("the total counts each lead once", Number(total?.leads) === leadsAll, `${total?.leads} vs ${leadsAll}`);

  section("What each person holds");
  const w = (await admin.sb.from("user_workload").select("lead_count, names_left, leads_held").eq("user_id", sean.me.id).single()).data;
  const held = Number(sql(`select count(*) from public.leads where assigned_user_id = ${sean.me.id} and stage = 'appt'`));
  check("names still to call apart from the leads held, and every record as before", w && Number(w.leads_held) === held
    && Number(w.lead_count) === Number(sql(`select count(*) from public.leads where assigned_user_id = ${sean.me.id}`)) && Number(w.names_left) >= 2, JSON.stringify(w));

  section("More on each person");
  const saved = await admin.sb.from("users").update({ timezone_id: 3, birth_date: "1990-05-01", start_date: "2021-03-15" }).eq("id", MIKE).select("timezone_id, birth_date, start_date").single();
  check("a time zone, date of birth and start date are kept", !saved.error && saved.data.timezone_id === 3 && saved.data.birth_date === "1990-05-01" && saved.data.start_date === "2021-03-15", saved.error?.message);
  check("…not a date of birth in the year 3000", Boolean((await admin.sb.from("users").update({ birth_date: "3000-01-01" }).eq("id", MIKE)).error));

  section("Birthdays and work anniversaries");
  const [y, m, d] = today.split("-").map(Number);
  const md = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  sql(`update public.users set birth_date = ${lit(`1990-${md}`)}, start_date = ${lit(`${y - 5}-${md}`)} where id = ${MIKE}`);
  sql(`delete from public.alert_sends where rule = 'celebrations' and key like ${lit(`%:${MIKE}:%`)}`);
  const sent = Number(sql(`select public.send_celebrations(${lit(today)}::date)`));
  const team = Number(sql("select count(*) from public.users where role in ('admin', 'manager') and status = 'active' and deleted_at is null"));
  const notes = (title) => Number(sql(`select count(*) from public.notifications where title = ${lit(title)} and created_at > now() - interval '1 minute'`));
  const who = sql(`select concat_ws(' ', first_name, left(nullif(last_name, ''), 1)) from public.users where id = ${MIKE}`);
  check("a birthday: every active manager and administrator is told", notes(`Happy Birthday ${who}!`) === team, `${notes(`Happy Birthday ${who}!`)} of ${team}`);
  check("…and a work anniversary, with the years", notes(`Happy 5 yr work anniversary ${who}!`) === team && sent >= 2 * team, `sent ${sent}`);
  check("…once a day: run again, nothing more is sent", Number(sql(`select public.send_celebrations(${lit(today)}::date)`)) === 0);
  check("…and only by the job, not by anyone signed in", Boolean((await admin.sb.rpc("send_celebrations", { p_day: today })).error));
} finally {
  sql(`update public.users set birth_date = ${before.birth_date ? lit(before.birth_date) : "null"}, start_date = ${before.start_date ? lit(before.start_date) : "null"}, timezone_id = null where id = ${MIKE}`);
  sql(`delete from public.notifications where (title like 'Happy Birthday %' or title like 'Happy % yr work anniversary %') and created_at > now() - interval '10 minutes'`);
  sql(`delete from public.alert_sends where rule = 'celebrations' and key like ${lit(`%:${MIKE}:%`)}`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}
finish("counts and celebrations");
