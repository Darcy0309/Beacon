/**
 * Time blocked out on a project's calendar (Sean, Oct 2026), against the
 * database as real signed-in people: a client's own people and staff add
 * and remove it, whole days or a time of day; a DB dev project's goes on
 * the appointment project's calendar it shares; another client's people
 * neither see nor change it.
 *
 * Removes everything it made.
 *
 *   node tests/integration/calendar-blocks.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `CB-TEST ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const client = await signIn("client@beacon.test");
const mine = Number(sql(`select company_id from public.users where email='client@beacon.test'`));
const other = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Other`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${mine}, ${type("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} DBDev`)}, ${mine}, ${type("DBDV")}, 1, ${APPT}) returning id`));
const THEIRS = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Theirs`)}, ${other}, ${type("APPT")}, 1) returning id`));
const sean = await signIn("sean@beacon.test");
const day = sql("select ((now() at time zone public.business_tz())::date + 7)::text");

try {
  section("Blocking out time");
  const whole = await client.sb.from("calendar_blocks").insert({ project_id: APPT, starts_on: day, ends_on: day, note: "Out of office" }).select("id, project_id, created_by").single();
  check("a client's person blocks a whole day on their project's calendar", !whole.error && whole.data.project_id === APPT && whole.data.created_by === client.me.id, whole.error?.message);
  const part = await sean.sb.from("calendar_blocks").insert({ project_id: DBDV, starts_on: day, ends_on: day, start_time: "10:00", end_time: "13:00" }).select("id, project_id").single();
  check("a manager blocks 10 AM – 1 PM; from the DB dev project it lands on the appointment project's calendar", !part.error && part.data.project_id === APPT, part.error?.message ?? JSON.stringify(part.data));
  const bad = await sean.sb.from("calendar_blocks").insert({ project_id: APPT, starts_on: day, ends_on: day, start_time: "13:00", end_time: "10:00" });
  check("…an end before the start is refused", Boolean(bad.error));
  const half = await sean.sb.from("calendar_blocks").insert({ project_id: APPT, starts_on: day, ends_on: day, start_time: "13:00" });
  check("…and a start with no end", Boolean(half.error));
  const cal = await sean.sb.rpc("calendar_project", { p_project_id: DBDV });
  check("the pair shares one calendar", cal.data === APPT);

  section("Whose it is to see and change");
  const seen = await client.sb.from("calendar_blocks").select("id").eq("project_id", APPT);
  check("the client's people see everything blocked on it, a manager's too", !seen.error && seen.data.length === 2, JSON.stringify(seen.data));
  const foreign = await client.sb.from("calendar_blocks").insert({ project_id: THEIRS, starts_on: day, ends_on: day });
  check("they cannot block another client's calendar", Boolean(foreign.error), foreign.error?.message);
  sql(`insert into public.calendar_blocks (project_id, starts_on, ends_on) values (${THEIRS}, ${lit(day)}, ${lit(day)})`);
  const peek = await client.sb.from("calendar_blocks").select("id").eq("project_id", THEIRS);
  check("…nor see what is blocked on it", !peek.error && peek.data.length === 0);
  const gone = await client.sb.from("calendar_blocks").delete().eq("id", part.data.id).select("id");
  check("they take a block off their own calendar", !gone.error && gone.data.length === 1);
  const notTheirs = await client.sb.from("calendar_blocks").delete().eq("project_id", THEIRS).select("id");
  check("…not off another client's", !notTheirs.error && notTheirs.data.length === 0);
} finally {
  sql(`delete from public.projects where id in (${DBDV}, ${APPT}, ${THEIRS})`);
  sql(`delete from public.companies where id = ${other}`);
  sql(`delete from public.activity_log where action like 'calendar.%' and created_at > now() - interval '10 minutes'`);
}

finish("calendar blocks");
