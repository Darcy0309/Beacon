/**
 * The account manager's dashboard and temporary passwords, against the
 * database as real signed-in users: a manager sets their own daily goals,
 * nobody else's; daily_production() gives a manager their own day and an
 * administrator everyone's, counting leads and appointments as the
 * production report does; project assignments made and removed are logged
 * for the 30-day change; and the temporary-password flag is an
 * administrator's to set, cleared only by setting a password.
 *
 * Removes everything it made.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `MD-TEST ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const today = sql("select ((now() at time zone public.business_tz())::date)::text");
const phoneBefore = sql(`select coalesce(phone, '') from public.users where id = ${SEAN}`);
const goalsBefore = sql(`select coalesce(json_agg(g), '[]') from public.daily_goals g where day = ${lit(today)} and user_id in (${SEAN}, ${MIKE})`);

const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));

try {
  section("Daily goals");
  const own = await sean.sb.from("daily_goals").upsert({ user_id: SEAN, day: today, leads_goal: 5, appts_goal: 2 }, { onConflict: "user_id,day" }).select("user_id");
  check("a manager sets their own goals for today", !own.error && own.data?.length === 1, own.error?.message);
  const other = await sean.sb.from("daily_goals").upsert({ user_id: MIKE, day: today, leads_goal: 99 }, { onConflict: "user_id,day" }).select("user_id");
  check("…not anyone else's", Boolean(other.error) || !other.data?.length, JSON.stringify(other.data));
  const tooMany = await sean.sb.from("daily_goals").upsert({ user_id: SEAN, day: today, leads_goal: 5000 }, { onConflict: "user_id,day" }).select("user_id");
  check("…and a goal over 1,000 is refused", Boolean(tooMany.error));

  section("Daily production");
  sql(`insert into public.pay_events (user_id, project_id, kind, amount, created_at) values
    (${SEAN}, ${project}, 'lead', 10, now()), (${SEAN}, ${project}, 'lead', 10, now()), (${SEAN}, ${project}, 'appointment', 40, now())`);
  const mine = await sean.sb.rpc("daily_production", { p_day: today });
  const me = mine.data?.find((r) => r.user_id === SEAN);
  check("a manager sees their own day: leads and appointments as the production report counts them, and their goals",
    !mine.error && mine.data?.length === 1 && Number(me?.leads) >= 2 && Number(me?.appointments) >= 1 && me?.leads_goal === 5 && me?.appts_goal === 2,
    mine.error?.message ?? JSON.stringify(mine.data));
  const all = await admin.sb.rpc("daily_production", { p_day: today });
  const people = (all.data ?? []).map((r) => r.user_id);
  check("an administrator sees every account manager", !all.error && people.includes(SEAN) && people.includes(MIKE), JSON.stringify(people));
  check("…with each one's goals", all.data?.find((r) => r.user_id === SEAN)?.leads_goal === 5);

  section("Project assignments, for the 30-day change");
  const before = Number(sql(`select coalesce(sum(change), 0) from public.project_assignment_log where user_id = ${SEAN} and at > now() - interval '1 minute'`));
  sql(`insert into public.project_assignments (project_id, ae_user_id) values (${project}, ${SEAN})`);
  check("an assignment made is logged", Number(sql(`select coalesce(sum(change), 0) from public.project_assignment_log where user_id = ${SEAN} and at > now() - interval '1 minute'`)) === before + 1);
  sql(`update public.project_assignments set ae_user_id = ${MIKE} where project_id = ${project}`);
  check("…one moved to someone else: off one, onto the other",
    Number(sql(`select coalesce(sum(change), 0) from public.project_assignment_log where user_id = ${SEAN} and at > now() - interval '1 minute'`)) === before
    && sql(`select change from public.project_assignment_log where user_id = ${MIKE} and project_id = ${project} order by id desc limit 1`) === "1");
  const log = await sean.sb.from("project_assignment_log").select("user_id").eq("project_id", project);
  check("a manager reads only their own changes", !log.error && log.data.every((r) => r.user_id === SEAN), JSON.stringify(log.data));

  section("Temporary passwords");
  sql(`update public.users set must_change_password = true where id = ${SEAN}`);
  const clear = await sean.sb.from("users").update({ must_change_password: false }).eq("id", SEAN).select("id");
  check("the person cannot clear the flag themselves", Boolean(clear.error) && sql(`select must_change_password from public.users where id = ${SEAN}`) === "t", clear.error?.message);
  const rpc = await sean.sb.rpc("clear_temporary_password");
  check("…setting their own password clears it", !rpc.error && rpc.data === true && sql(`select must_change_password from public.users where id = ${SEAN}`) === "f", rpc.error?.message);
  const name = await sean.sb.from("users").update({ phone: "602-555-0199" }).eq("id", SEAN).select("phone");
  check("…and they update their own contact details", !name.error && name.data?.[0]?.phone === "602-555-0199", name.error?.message);
} finally {
  sql(`update public.users set must_change_password = false, phone = nullif(${lit(phoneBefore)}, '') where id = ${SEAN}`);
  sql(`delete from public.daily_goals where day = ${lit(today)} and user_id in (${SEAN}, ${MIKE})`);
  for (const g of JSON.parse(goalsBefore)) sql(`insert into public.daily_goals (user_id, day, leads_goal, appts_goal) values (${g.user_id}, ${lit(g.day)}, ${g.leads_goal ?? "null"}, ${g.appts_goal ?? "null"})`);
  sql(`delete from public.pay_events where project_id = ${project}`);
  sql(`delete from public.project_assignments where project_id = ${project}`);
  sql(`delete from public.project_assignment_log where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("manager dashboard");
