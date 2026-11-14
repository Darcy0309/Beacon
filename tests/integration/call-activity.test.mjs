/**
 * Call Activity's people and first calls (Sean, Nov 2026): on a manager's dashboard their own line, and
 * the team (account managers only: no administrators, no client's Sales Rep); everyone for an
 * administrator; and when each person's first call out started.
 *
 *   node tests/run.mjs tests/integration/call-activity.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `CALLACT${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const RACHEL = userId("rachel@beacon.test");
const ADMIN = userId("admin@beacon.test");
const today = sql("select (now() at time zone public.business_tz())::date::text");
// A call today at a time of day (business time): out or in, answered for `talk` seconds or not.
let n = 0;
const call = (user, dir, hhmm, talk = null) => {
  n += 1;
  const sid = `CA${TAG.toLowerCase()}${String(n).padStart(4, "0")}`;
  const at = `(${lit(today)}::date + time ${lit(hhmm)}) at time zone public.business_tz()`;
  sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, started_at, rang_at, answered_at, ended_at, talk_seconds)
    values (${lit(sid)}, ${lit(sid)}, ${user}, ${lit(dir)}, '+16025550100', ${talk == null ? "'no-answer'" : "'completed'"}, ${at}, ${at},
      ${talk == null ? "null" : at}, ${at} + interval '${talk ?? 5} seconds', ${talk ?? 0})`);
};
// Mike works on Central time (Sean, Nov 2026: each manager's own clock).
const mikeZone = sql(`select coalesce(timezone_id::text, 'null') from public.users where id = ${MIKE}`);
const CENTRAL = Number(sql("select id from public.timezones where iana = 'America/Chicago' order by id limit 1"));
sql(`update public.users set timezone_id = ${CENTRAL} where id = ${MIKE}`);
// Rachel is a client's Sales Rep.
const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Insurance`)}, ${RACHEL}) returning id`));

const [sean, admin] = await Promise.all(["sean", "admin"].map((u) => signIn(`${u}@beacon.test`)));
const report = async (who, scope, user = null) => {
  const { data, error } = await who.sb.rpc("phone_call_report", { p_from: today, p_to: today, p_scope: scope, p_user: user });
  if (error) throw error;
  return data;
};
const ids = (rows) => rows.map((r) => r.user_id);
const first = (rows, id) => rows.find((r) => r.user_id === id)?.first_call ?? null;
const BUSINESS = sql("select public.business_tz()");
const clock = (iso, timeZone = BUSINESS) => (iso ? new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" }) : null);
// Minutes past midnight on a clock, to the half hour.
const halfHour = (iso, timeZone) => {
  const [h, m] = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(iso)).filter((p) => p.type !== "literal").map((p) => Number(p.value));
  return h * 60 + Math.floor(m / 30) * 30;
};

try {
  call(SEAN, "out", "08:02", 60);
  call(SEAN, "out", "07:41");          // not answered: still his first call
  call(SEAN, "in", "06:30", 30);       // a call in: not a call he made
  call(MIKE, "out", "09:15", 120);
  call(RACHEL, "out", "08:00", 10);
  call(ADMIN, "out", "08:30", 10);

  section("A manager's own line");
  const mine = await report(sean, "me");
  check("only theirs", JSON.stringify(ids(mine)) === JSON.stringify([SEAN]), JSON.stringify(ids(mine)));
  check("…with when their first call out started (7:41, not the 6:30 call in)", clock(first(mine, SEAN)) === "7:41 AM", clock(first(mine, SEAN)));
  const row = mine[0];
  check("…and their numbers as before", Number(row.total) >= 3 && Number(row.out_handled) >= 1 && Number(row.out_cancelled) >= 1 && Number(row.in_handled) >= 1, JSON.stringify(row));
  const other = await report(sean, "me", MIKE);
  check("…never someone else's, whoever they name", JSON.stringify(ids(other)) === JSON.stringify([SEAN]), JSON.stringify(ids(other)));

  section("The team");
  const team = await report(sean, "team");
  check("the account managers", ids(team).includes(SEAN) && ids(team).includes(MIKE), JSON.stringify(ids(team)));
  check("…not a client's Sales Rep", !ids(team).includes(RACHEL), JSON.stringify(ids(team)));
  check("…nor an administrator, though they made calls", !ids(team).includes(ADMIN));
  check("…nor the calls in that rang no one", !team.some((r) => r.user_id == null));
  check("each with their first call", clock(first(team, MIKE)) === "9:15 AM", clock(first(team, MIKE)));
  const asked = await report(sean, "all");
  check("a manager asking for everyone gets the team", JSON.stringify(ids(asked).sort()) === JSON.stringify(ids(team).sort()));

  section("Each person's own clock");
  const mikeRow = team.find((r) => r.user_id === MIKE);
  check("a manager's time zone comes with their line", mikeRow?.time_zone === "America/Chicago", mikeRow?.time_zone);
  const { data: times, error: timesError } = await sean.sb.rpc("phone_call_times", { p_day: today, p_scope: "team", p_user: null });
  if (timesError) throw timesError;
  const mikeSlot = times.find((r) => r.user_id === MIKE);
  check("the chart's half hour on the business's clock…", mikeSlot?.slot === halfHour(mikeRow.first_call, BUSINESS), JSON.stringify(mikeSlot));
  check("…and on Mike's own (Central)", mikeSlot?.local_slot === halfHour(mikeRow.first_call, "America/Chicago"), JSON.stringify(mikeSlot));
  check("Mountain split in two: Arizona, and Utah and Montana with daylight saving",
    sql("select string_agg(iana, ',' order by iana) from public.timezones where name in ('MST (Arizona)', 'MT (Utah, Montana)')") === "America/Denver,America/Phoenix");

  section("An administrator");
  const everyone = await report(admin, "all");
  check("everyone on the phone: administrators and Sales Reps too", [SEAN, MIKE, RACHEL, ADMIN].every((id) => ids(everyone).includes(id)), JSON.stringify(ids(everyone)));
  const seeing = await report(admin, "me", MIKE);
  check("…and a manager's own line, seeing their dashboard", JSON.stringify(ids(seeing)) === JSON.stringify([MIKE]) && clock(first(seeing, MIKE)) === "9:15 AM", JSON.stringify(seeing));
} finally {
  sql(`delete from public.phone_calls where call_sid like ${lit(`CA${TAG.toLowerCase()}%`)}`);
  sql(`delete from public.companies where id = ${company}`);
  sql(`update public.users set timezone_id = ${mikeZone} where id = ${MIKE}`);
}

finish("call activity");
