/**
 * Rows two and three of the account manager's dashboard, against the
 * database as real signed-in users: production_days() over a range (own
 * for a manager, everyone's for an administrator); team_production() — the
 * day's leads and appointments of every active manager, for staff only;
 * and moving an appointment one set, or one's own reminder, on the
 * dashboard's calendar (nobody else's, nothing gone by).
 *
 * Removes everything it made.
 *
 *   node tests/integration/manager-dashboard-rows.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `MDR-TEST ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const today = sql("select ((now() at time zone public.business_tz())::date)::text");
const inDays = (n) => sql(`select (${lit(today)}::date + ${n})::text`);
const goalsBefore = sql(`select coalesce(json_agg(g), '[]') from public.daily_goals g where day = ${lit(today)} and user_id = ${SEAN}`);

const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test");
const mike = await signIn("mike@beacon.test");
const client = await signIn("client@beacon.test");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (project_id, company_name, phone) values (${project}, ${lit(`${TAG} Plumbing`)}, '602-555-0100') returning id`));
const scheduled = sql("select id from public.appointment_statuses where name = 'Scheduled'");

try {
  section("Production over a range");
  sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount, created_at) values
    (${SEAN}, ${project}, ${lead}, 'lead', 10, now()), (${SEAN}, ${project}, ${lead}, 'lead', 10, now()),
    (${SEAN}, ${project}, ${lead}, 'appointment', 40, now())`);
  sql(`insert into public.daily_goals (user_id, day, leads_goal, appts_goal) values (${SEAN}, ${lit(today)}, 5, 2)
       on conflict (user_id, day) do update set leads_goal = 5, appts_goal = 2`);
  const week = await sean.sb.rpc("production_days", { p_from: inDays(-6), p_to: today });
  const day = week.data?.find((r) => r.day === today);
  check("a manager sees their own days: today's leads, appointments and goals", !week.error && Number(day?.leads) >= 2 && Number(day?.appointments) >= 1 && day?.leads_goal === 5,
    week.error?.message ?? JSON.stringify(day));
  check("…and nobody else's", (week.data ?? []).every((r) => r.user_id === SEAN), JSON.stringify([...new Set((week.data ?? []).map((r) => r.user_id))]));
  const all = await admin.sb.rpc("production_days", { p_from: inDays(-6), p_to: today });
  const people = new Set((all.data ?? []).map((r) => r.user_id));
  check("an administrator sees every account manager over the range", !all.error && people.has(SEAN) && people.has(MIKE), all.error?.message);
  const empty = await admin.sb.rpc("production_days", { p_from: "2020-01-01", p_to: "2020-01-07" });
  check("…even one with nothing in it, listed with no day", !empty.error && (empty.data ?? []).some((r) => r.user_id === MIKE && r.day === null), empty.error?.message);

  section("Daily Team Production");
  const team = await mike.sb.rpc("team_production", { p_day: today });
  const seanRow = team.data?.find((r) => r.user_id === SEAN);
  check("any manager sees every active manager's leads and appointments today", !team.error && Number(seanRow?.leads) >= 2 && Number(seanRow?.appointments) >= 1 && team.data.some((r) => r.user_id === MIKE),
    team.error?.message ?? JSON.stringify(team.data));
  check("…counts only: no pay, hours or calls", seanRow && Object.keys(seanRow).sort().join() === "appointments,first_name,last_name,leads,user_id", Object.keys(seanRow ?? {}).join());
  const outside = await client.sb.rpc("team_production", { p_day: today });
  check("…a client sees none of it", !outside.data?.length, JSON.stringify(outside.data));

  section("Moving an appointment on the calendar");
  const appt = Number(sql(`insert into public.appointments (lead_id, user_id, appt_date, appt_time, status_id, project_id)
    values (${lead}, ${SEAN}, ${lit(inDays(1))}, '9:30 AM', ${scheduled}, ${project}) returning id`));
  const others = await mike.sb.rpc("move_appointment", { p_id: appt, p_date: inDays(2), p_time: "2:00 PM" });
  check("someone who did not set it cannot move it", Boolean(others.error) && sql(`select appt_date from public.appointments where id = ${appt}`) === inDays(1), others.error?.message);
  const past = await sean.sb.rpc("move_appointment", { p_id: appt, p_date: inDays(-1), p_time: "2:00 PM" });
  check("…nor onto a day gone by", Boolean(past.error), past.error?.message);
  const badTime = await sean.sb.rpc("move_appointment", { p_id: appt, p_date: inDays(2), p_time: "25:00" });
  check("…nor to a time that is not one", Boolean(badTime.error), badTime.error?.message);
  const moved = await sean.sb.rpc("move_appointment", { p_id: appt, p_date: inDays(2), p_time: "2:00 pm" });
  check("the person who set it moves it to another day and time, Scheduled becoming Rescheduled",
    !moved.error && sql(`select a.appt_date || ' ' || a.appt_time || ' ' || s.name from public.appointments a join public.appointment_statuses s on s.id = a.status_id where a.id = ${appt}`) === `${inDays(2)} 2:00 PM Rescheduled`,
    moved.error?.message ?? sql(`select appt_date || ' ' || appt_time from public.appointments where id = ${appt}`));

  section("Moving a reminder");
  const rem = Number(sql(`insert into public.reminders (lead_id, user_id, remind_at, note) values (${lead}, ${SEAN}, now() + interval '1 day', ${lit(TAG)}) returning id`));
  const notMine = await mike.sb.rpc("move_reminder", { p_id: rem, p_date: inDays(3), p_time: "10:15 AM" });
  check("someone else's reminder does not move", /not one of your reminders/i.test(notMine.error?.message ?? ""), notMine.error?.message);
  const gone = await sean.sb.rpc("move_reminder", { p_id: rem, p_date: inDays(-1), p_time: "10:15 AM" });
  check("…nor to a time already gone", Boolean(gone.error), gone.error?.message);
  const ok = await sean.sb.rpc("move_reminder", { p_id: rem, p_date: inDays(3), p_time: "10:15 AM" });
  check("one's own reminder moves to another day and time",
    !ok.error && sql(`select to_char(remind_at at time zone public.business_tz(), 'YYYY-MM-DD FMHH12:MI AM') from public.reminders where id = ${rem}`) === `${inDays(3)} 10:15 AM`, ok.error?.message);
  sql(`update public.reminders set sent_at = now() where id = ${rem}`);
  const sent = await sean.sb.rpc("move_reminder", { p_id: rem, p_date: inDays(4), p_time: "10:15 AM" });
  check("…not once it has gone off", Boolean(sent.error), sent.error?.message);
} finally {
  sql(`delete from public.daily_goals where day = ${lit(today)} and user_id = ${SEAN}`);
  for (const g of JSON.parse(goalsBefore)) sql(`insert into public.daily_goals (user_id, day, leads_goal, appts_goal) values (${g.user_id}, ${lit(g.day)}, ${g.leads_goal ?? "null"}, ${g.appts_goal ?? "null"})`);
  sql(`delete from public.reminders where lead_id = ${lead}`);
  sql(`delete from public.pay_events where project_id = ${project}`);
  sql(`delete from public.appointments where lead_id = ${lead}`);
  sql(`delete from public.notifications where body like ${lit(`%${TAG}%`)} or title like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("manager dashboard rows");
