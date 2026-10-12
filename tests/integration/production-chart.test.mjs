/**
 * The administrator's production chart, against the database: only leads
 * and appointments the team developed (not names loaded), by the day and
 * for one day by the hour; minutes worked split between lead (DB dev) and
 * appointment projects by the calls made on each; narrowed to one manager
 * or project; administrators only; and the monthly goals theirs to set.
 *
 * Removes everything it made.
 *
 *   node tests/integration/production-chart.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `PCH-TEST ${Date.now()}`;
const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test");
const SEAN = sean.me.id;
const MIKE = Number(sql("select id from public.users where email = 'mike@beacon.test'"));
const tz = sql("select public.business_tz()");
// A past Wednesday, quiet in the seed data.
const DAY = "2025-03-12";
const at = (hour, minute = 0) => lit(`${DAY} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
const local = (hour, minute = 0) => `(${at(hour, minute)}::timestamp at time zone ${lit(tz)})`;
const type = (code) => sql(`select id from public.project_types where code = ${lit(code)}`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const dbdv = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} DBDev`)}, ${company}, ${type("DBDV")}, 1) returning id`));
const appt = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const lead = Number(sql(`insert into public.leads (project_id, company_name) values (${dbdv}, ${lit(`${TAG} Plumbing`)}) returning id`));
const goalBefore = sql("select coalesce(row_to_json(g)::text, '') from public.production_goals g where month = '2025-03-01'");

try {
  // Sean: 3 leads (9 AM, 9:30, 2 PM) and an appointment set on the DB dev project (10 AM); Mike: an appointment on the appointment project.
  sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount, created_at) values
    (${SEAN}, ${dbdv}, ${lead}, 'lead', 10, ${local(9)}), (${SEAN}, ${dbdv}, ${lead}, 'lead', 10, ${local(9, 30)}),
    (${SEAN}, ${dbdv}, ${lead}, 'lead', 10, ${local(14)}), (${SEAN}, ${dbdv}, ${lead}, 'appointment', 40, ${local(10)}),
    (${MIKE}, ${appt}, ${lead}, 'appointment', 40, ${local(11)}),
    (${SEAN}, ${dbdv}, ${lead}, 'lead', -10, ${local(15)})`);
  // Sean works 9:00-9:59 calling only DB dev names; Mike 11:00-11:29: two appointment calls, one DB dev.
  sql(`insert into public.work_activity (user_id, minute, kind)
    select ${SEAN}, gs, 'use' from generate_series(${local(9)}, ${local(9, 59)}, interval '1 minute') gs
    union all select ${MIKE}, gs, 'use' from generate_series(${local(11)}, ${local(11, 29)}, interval '1 minute') gs
    on conflict do nothing`);
  sql(`insert into public.call_records (lead_id, project_id, user_id, call_date) values
    (${lead}, ${dbdv}, ${SEAN}, ${local(9, 5)}), (${lead}, ${appt}, ${MIKE}, ${local(11, 2)}), (${lead}, ${appt}, ${MIKE}, ${local(11, 9)}),
    (${lead}, ${dbdv}, ${MIKE}, ${local(11, 20)})`);

  section("What the team developed");
  const { data: d, error } = await admin.sb.rpc("production_chart", { p_from: DAY, p_to: DAY });
  const day = d?.days?.find((x) => x.day === DAY);
  check("leads and appointments developed (a charge-back is not one)", !error && day?.leads === 3 && day?.appts === 2, error?.message ?? JSON.stringify(day));
  const byHour = Object.fromEntries((d?.hours ?? []).map((h) => [h.hour, `${h.leads}/${h.appts}`]));
  check("…for one day, by the hour", byHour[9] === "2/0" && byHour[10] === "0/1" && byHour[11] === "0/1" && byHour[14] === "1/0", JSON.stringify(byHour));
  const workedAll = (await admin.sb.rpc("production_chart", { p_from: DAY, p_to: DAY })).data.days.find((x) => x.day === DAY);
  check("minutes worked, split by the calls on each kind of project",
    Math.abs(workedAll.lead_minutes - (60 + 10)) <= 2 && Math.abs(workedAll.appt_minutes - 20) <= 2, JSON.stringify(workedAll));

  section("Narrowed");
  const mine = (await admin.sb.rpc("production_chart", { p_from: DAY, p_to: DAY, p_user: SEAN })).data.days.find((x) => x.day === DAY);
  check("one manager: their leads, appointments and hours", mine.leads === 3 && mine.appts === 1 && Math.abs(mine.lead_minutes - 60) <= 1 && mine.appt_minutes === 0, JSON.stringify(mine));
  const proj = (await admin.sb.rpc("production_chart", { p_from: DAY, p_to: DAY, p_project: appt })).data.days.find((x) => x.day === DAY);
  check("one project: what was developed on it, and the minutes that went to it", proj.leads === 0 && proj.appts === 1 && Math.abs(proj.appt_minutes - 20) <= 2 && proj.lead_minutes === 0, JSON.stringify(proj));
  const range = (await admin.sb.rpc("production_chart", { p_from: "2025-03-10", p_to: "2025-03-14" })).data;
  check("a range: by the day, no hours", range.hours === null && range.days.some((x) => x.day === DAY && x.leads === 3), JSON.stringify(range).slice(0, 200));
  const managerTry = await sean.sb.rpc("production_chart", { p_from: DAY, p_to: DAY });
  check("administrators only", Boolean(managerTry.error), managerTry.error?.message);

  section("Monthly goals");
  const set = await admin.sb.from("production_goals").upsert({ month: "2025-03-01", leads_goal: 1260, appts_goal: 800, leads_per_hour: 3, appts_per_hour: 2 }, { onConflict: "month" }).select("month");
  check("an administrator sets a month's goals", !set.error && set.data?.length === 1, set.error?.message);
  const read = await sean.sb.from("production_goals").select("month").eq("month", "2025-03-01");
  const write = await sean.sb.from("production_goals").upsert({ month: "2025-03-01", leads_goal: 1 }, { onConflict: "month" }).select("month");
  check("…a manager neither reads nor sets them", !read.data?.length && (Boolean(write.error) || !write.data?.length));
  const notFirst = await admin.sb.from("production_goals").insert({ month: "2025-03-15", leads_goal: 1 });
  check("…a goal is for a whole month", Boolean(notFirst.error));
} finally {
  sql(`delete from public.production_goals where month = '2025-03-01'`);
  if (goalBefore) sql(`insert into public.production_goals select * from json_populate_record(null::public.production_goals, ${lit(goalBefore)}::json)`);
  sql(`delete from public.work_activity where user_id in (${SEAN}, ${MIKE}) and minute >= ${local(0)} and minute < ${local(23, 59)}`);
  sql(`delete from public.call_records where lead_id = ${lead}`);
  sql(`delete from public.pay_events where lead_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id in (${dbdv}, ${appt})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("production chart");
