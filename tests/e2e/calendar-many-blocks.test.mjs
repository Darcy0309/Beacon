/**
 * A calendar with more blocked time than the API returns at once (Sean, Oct
 * 2026: a client's full calendar left out days its calendar tile showed).
 * A connected personal calendar adds a busy time for every meeting; past
 * 1,000 of them, the days blocked out after those went missing.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/calendar-many-blocks.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { cookieHeader, sessionCookies } from "../support/auth.mjs";
import { APP_URL } from "../support/env.mjs";

const TAG = `MB ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const CLIENT = Number(sql("select id from public.users where email='client@beacon.test'"));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const inDays = (n) => sql(`select ((now() at time zone public.business_tz())::date + ${n})::text`);
const LATE = inDays(75);
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const feed = Number(sql(`insert into public.calendar_feeds (user_id, project_id, url, provider, busy_count, last_synced_at)
  values (${CLIENT}, ${APPT}, 'https://calendar.google.com/calendar/ical/mb/private-test/basic.ics', 'Google Calendar', 1100, now()) returning id`));
// 1,100 busy times, twenty a day for the next 55 days; then a day blocked out by hand after them.
sql(`insert into public.calendar_blocks (project_id, feed_id, created_by, starts_on, ends_on, start_time, end_time)
  select ${APPT}, ${feed}, ${CLIENT}, ${lit(inDays(0))}::date + g / 20, ${lit(inDays(0))}::date + g / 20,
    time '07:00' + (g % 20) * interval '30 min', time '07:15' + (g % 20) * interval '30 min'
  from generate_series(0, 1099) g`);
sql(`insert into public.calendar_blocks (project_id, starts_on, ends_on, note) values (${APPT}, ${lit(LATE)}, ${lit(LATE)}, 'Office closed')`);

const jar = await sessionCookies("admin@beacon.test");
const page = async (path) => (await fetch(`${APP_URL}${path}`, { headers: { cookie: cookieHeader(jar) } })).text();
const blockedOn = (html, iso) => {
  const label = new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return new RegExp(`aria-label="${label}, \\d+ appointments?, blocked out"`).test(html);
};
const month = `${LATE.slice(0, 8)}01`;

try {
  section("Past 1,000 blocks");
  check("the client's full calendar shows the day blocked out after 1,100 busy times",
    blockedOn(await page(`/calendar?client=${company}&view=month&d=${month}`), LATE));
  check("…and so does the project's own calendar",
    blockedOn(await page(`/calendar?project=${APPT}&view=month&d=${month}`), LATE));
  check("the day view lists it",
    (await page(`/calendar?client=${company}&view=day&d=${LATE}`)).includes("Office closed"));
} finally {
  sql(`delete from public.calendar_blocks where project_id = ${APPT}`);
  sql(`delete from public.calendar_feeds where id = ${feed}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}
finish("calendar with many blocks");
