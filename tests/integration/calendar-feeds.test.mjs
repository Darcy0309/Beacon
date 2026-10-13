/**
 * A personal calendar connected to a project's calendar (Sean, Oct 2026),
 * against the database as real signed-in people: the link is its owner's
 * alone to read (not an administrator's, not another client's); nobody can
 * pass off a block as a synced one, nor take a synced busy time off by
 * itself; disconnecting takes its busy times with it.
 *
 * Removes everything it made.
 *
 *   node tests/integration/calendar-feeds.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { adminClient, signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `CF-TEST ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const client = await signIn("client@beacon.test");
const sean = await signIn("sean@beacon.test");
const admin = await signIn("admin@beacon.test");
const service = adminClient();
const mine = Number(sql(`select company_id from public.users where email='client@beacon.test'`));
const other = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Other`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${mine}, ${type("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} DBDev`)}, ${mine}, ${type("DBDV")}, 1, ${APPT}) returning id`));
const THEIRS = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Theirs`)}, ${other}, ${type("APPT")}, 1) returning id`));
const LINK = "https://calendar.google.com/calendar/ical/someone/private-abc123/basic.ics";
const day = sql("select ((now() at time zone public.business_tz())::date + 5)::text");

try {
  section("Connecting a calendar");
  const made = await client.sb.from("calendar_feeds").insert({ project_id: DBDV, user_id: client.me.id, url: LINK, provider: "Google Calendar" }).select("id, project_id, user_id").single();
  check("a client's person connects theirs; from a DB dev project it is on the appointment project's calendar", !made.error && made.data.project_id === APPT && made.data.user_id === client.me.id, made.error?.message);
  const feed = made.data?.id;
  const forged = await sean.sb.from("calendar_feeds").insert({ project_id: APPT, user_id: client.me.id, url: LINK, provider: "Google Calendar" }).select("user_id").single();
  check("nobody connects one in someone else's name: it is their own", !forged.error && forged.data.user_id === sean.me.id, forged.error?.message ?? JSON.stringify(forged.data));
  const foreign = await client.sb.from("calendar_feeds").insert({ project_id: THEIRS, user_id: client.me.id, url: LINK, provider: "Google Calendar" });
  check("…nor to another client's calendar", Boolean(foreign.error), foreign.error?.message);
  const plain = await client.sb.from("calendar_feeds").update({ url: "http://calendar.google.com/x" }).eq("id", feed);
  check("…and a link is https", Boolean(plain.error));

  section("The link is its owner's alone");
  const own = await client.sb.from("calendar_feeds").select("url").eq("id", feed);
  check("its owner reads it", own.data?.[0]?.url === LINK);
  const byAdmin = await admin.sb.from("calendar_feeds").select("id, url").eq("id", feed);
  check("an administrator does not", !byAdmin.error && byAdmin.data.length === 0, JSON.stringify(byAdmin.data));
  const byManager = await sean.sb.from("calendar_feeds").select("id, url").eq("id", feed);
  check("…nor a manager on the project", !byManager.error && byManager.data.length === 0);

  section("Its busy times");
  // As the server writes them after reading the calendar.
  const wrote = await service.from("calendar_blocks").insert([
    { project_id: APPT, feed_id: feed, created_by: client.me.id, starts_on: day, ends_on: day, start_time: "14:00", end_time: "15:00" },
    { project_id: APPT, feed_id: feed, created_by: client.me.id, starts_on: day, ends_on: day },
  ]).select("id");
  check("the server puts them on the calendar", !wrote.error && wrote.data.length === 2, wrote.error?.message);
  const seen = await sean.sb.from("calendar_blocks").select("id, feed_id, note").eq("project_id", APPT);
  check("a manager sees them as blocked time, with nothing said of why", seen.data?.length === 2 && seen.data.every((b) => b.feed_id === feed && b.note === null), JSON.stringify(seen.data));
  const fake = await sean.sb.from("calendar_blocks").insert({ project_id: APPT, feed_id: feed, starts_on: day, ends_on: day, note: "by hand" }).select("id, feed_id").single();
  check("a block added by hand cannot pass as a synced one", !fake.error && fake.data.feed_id === null, fake.error?.message);
  const pick = await sean.sb.from("calendar_blocks").delete().eq("id", wrote.data[0].id).select("id");
  check("a synced busy time is not taken off by itself, by a manager", !pick.error && pick.data.length === 0);
  const pickOwn = await client.sb.from("calendar_blocks").delete().eq("id", wrote.data[0].id).select("id");
  check("…or by its owner (they disconnect instead)", !pickOwn.error && pickOwn.data.length === 0);

  section("Disconnecting");
  const notMine = await sean.sb.from("calendar_feeds").delete().eq("id", feed).select("id");
  check("nobody else disconnects it", !notMine.error && notMine.data.length === 0);
  const gone = await client.sb.from("calendar_feeds").delete().eq("id", feed).select("id");
  check("its owner does, and its busy times go with it",
    !gone.error && gone.data.length === 1 && sql(`select count(*) from public.calendar_blocks where project_id = ${APPT} and feed_id is not null`) === "0"
    && sql(`select count(*) from public.calendar_blocks where project_id = ${APPT}`) === "1", gone.error?.message);
} finally {
  sql(`delete from public.projects where id in (${DBDV}, ${APPT}, ${THEIRS})`);
  sql(`delete from public.companies where id = ${other}`);
}

finish("calendar feeds");
