/**
 * Share names evenly, month by month (Sean, Oct 2026): a rep who has been
 * calling a month's renewals doesn't keep them all when a second rep joins.
 * 120 names with one rep, the 60 renewing in December already called; a
 * second rep joins and each has 30 of December's and 30 of January's.
 * Sharing again moves nothing.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `SHARE-TEST ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const A = userId("admin@beacon.test");
const B = userId("sean@beacon.test");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (company_id, name, project_type_id) values (${company}, ${lit(`${TAG} Appts`)}, (select id from public.project_types where code = 'APPT')) returning id`));
const noContact = Number(sql("select id from public.call_results where project_type = 'APPT' and name = 'Lead-No Contact'"));
const split = () => sql(`select string_agg(rep || ':' || mon || '=' || n, ',' order by rep, mon) from (
  select case l.assigned_user_id when ${A} then 'A' when ${B} then 'B' end as rep, extract(month from i.ultimate_xdate)::int as mon, count(*) as n
    from public.leads l join public.insurance_details i on i.lead_id = l.id where l.project_id = ${project} group by 1, 2) t`);

try {
  section("A second rep joins");
  sql(`insert into public.project_assignments (project_id, ae_user_id) values (${project}, ${A})`);
  sql(`with l as (
    insert into public.leads (project_id, company_name, result_id, assigned_user_id, call_weight, date_last_worked)
    select ${project}, ${lit(TAG)} || ' ' || g, ${noContact}, ${A}, case when g <= 60 then 3 else 0 end, case when g <= 60 then now() end
      from generate_series(1, 120) g returning id, company_name)
  insert into public.insurance_details (lead_id, ultimate_xdate)
  select id, case when split_part(company_name, ' ', 3)::int <= 60 then date '2026-12-15' else date '2027-01-15' end from l`);
  check("to begin with, one rep holds all 120", split() === "A:1=60,A:12=60", split());
  sql(`insert into public.project_assignments (project_id, ae_user_id) values (${project}, ${B})`);
  sql(`select public.distribute_names(${project})`);
  check("each rep has half of every month, December's called names too", split() === "A:1=30,A:12=30,B:1=30,B:12=30", split());
  check("sharing again moves nothing", sql(`select public.distribute_names(${project}) ->> 'moved'`) === "0");
} finally {
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where project_id = ${project})`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.project_assignments where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("share by month");
