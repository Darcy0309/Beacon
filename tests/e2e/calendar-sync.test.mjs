/**
 * Syncing a personal calendar to a project's (Sean, Oct 2026): the Sync my
 * calendar dialog, with what it reads and what it never does; a link that
 * is not a Google, Outlook or iCloud calendar refused; busy times shown as
 * Busy, whose calendar and no more, on the lead sheet and in the warning
 * when a slot is taken; nobody else seeing the connection; and
 * disconnecting. (The busy times here are put in as the server would after
 * reading a calendar: no outside calendar is read in this test.)
 *
 * Removes everything it made.
 *
 *   node tests/e2e/calendar-sync.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CSY ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const result = (t, name) => Number(sql(`select id from public.call_results where project_type='${t}' and name=${lit(name)}`));
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const [CLIENT, company, clientName] = sql("select id || '|' || company_id || '|' || first_name || ' ' || last_name from public.users where email='client@beacon.test'").split("|");
const inDays = (n) => sql(`select ((now() at time zone public.business_tz())::date + ${n})::text`);
const [D1, D2] = [inDays(1), inDays(2)];
const us = (iso) => `${iso.slice(5, 7)}/${iso.slice(8)}/${iso.slice(0, 4)}`;
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} DBDev`)}, ${company}, ${type("DBDV")}, 1, ${APPT}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN})`);
const lead = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id, result_id) values (${lit(`${TAG} Caller Co`)}, ${DBDV}, ${SEAN}, ${result("DBDV", "Viable-CallBack")}) returning id`));
const LINK = "https://calendar.google.com/calendar/ical/jeff/private-test/basic.ics";
// Connected and read a moment ago, so opening the calendar does not read it again.
const feed = Number(sql(`insert into public.calendar_feeds (user_id, project_id, url, provider, busy_count, last_synced_at)
  values (${CLIENT}, ${APPT}, ${lit(LINK)}, 'Google Calendar', 2, now()) returning id`));
sql(`insert into public.calendar_blocks (project_id, feed_id, created_by, starts_on, ends_on, start_time, end_time) values
  (${APPT}, ${feed}, ${CLIENT}, ${lit(D1)}, ${lit(D1)}, '14:00', '15:00'), (${APPT}, ${feed}, ${CLIENT}, ${lit(D2)}, ${lit(D2)}, null, null)`);

const browser = await launchBrowser();
const dialog = (page) => page.ev(`document.querySelector('[role=dialog]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
try {
  section("My calendar, synced");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await client.go(`/calendar?project=${APPT}&view=month&d=${D2}`, 6000);
  check("the calendar says mine is synced, and how many busy times it brought",
    Boolean(await until(async () => /Google Calendar synced/i.test(await client.ev(`document.querySelector('[data-sync-calendar]')?.innerText ?? ''`))))
    && /2 busy times from synced calendars/.test(await client.ev(`document.querySelector('[data-blocked-time]')?.innerText ?? ''`)),
    await client.ev(`document.querySelector('[data-blocked-time]')?.innerText`));
  check("…the day I am out is shaded in the month", Boolean(await client.ev(`[...document.querySelectorAll('button[data-blocked="day"]')].length > 0`)));
  await client.click("[data-sync-calendar]");
  await until(() => client.ev(`!!document.querySelector('[data-sync-form]')`));
  check("the dialog says what is read and what never is", /Only when you are busy is read/i.test(await dialog(client)) && /never read, kept or shown/i.test(await dialog(client)), await dialog(client));
  check("…that it is connected, and when it was last read", /Google Calendar is connected/.test(await dialog(client)) && /2 busy times in the next 90 days/.test(await dialog(client)));
  await client.click("[role=dialog] summary");
  check("…and where to find the link, for Google, Outlook and iCloud", /Secret address in iCal format/.test(await dialog(client)) && /Publish a calendar/.test(await dialog(client)) && /Public Calendar/.test(await dialog(client)));
  await client.fill('[data-sync-form] input[name="url"]', "https://example.com/my-calendar.ics");
  await client.click("[data-sync-form] button[type=submit]");
  check("a link that is not a Google, Outlook or iCloud calendar is refused, and nothing changes",
    Boolean(await until(async () => /Use the private link from Google Calendar, Outlook or iCloud/.test(await dialog(client))))
    && sql(`select url from public.calendar_feeds where id = ${feed}`) === LINK, await dialog(client));

  section("What everyone else sees");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await sean.go(`/calendar?project=${APPT}`, 6000);
  check("a manager is offered to sync their own; the client's connection is not theirs to see",
    Boolean(await until(async () => /^Sync my calendar$/i.test((await sean.ev(`document.querySelector('[data-sync-calendar]')?.innerText.trim() ?? ''`)))))
    && /2 busy times from synced calendars/.test(await sean.ev(`document.querySelector('[data-blocked-time]')?.innerText ?? ''`)));
  await sean.go(`/leads/${lead}?project=${DBDV}`, 6000);
  await until(() => sean.ev(`!!document.querySelector('[data-project-calendar] [data-day="${D1}"]')`));
  await sean.click(`[data-project-calendar] [data-day="${D1}"]`);
  const busy = await until(() => sean.ev(`document.querySelector('[data-project-calendar] [data-synced]')?.innerText.replace(/\\s+/g, ' ') ?? null`));
  check("on the lead sheet: Busy, when, and whose calendar; nothing about what it is", new RegExp(`^Busy · 2:00 PM – 3:00 PM ${clientName}'s calendar$`).test(busy ?? ""), busy);
  check("…and not one to take off by hand", !(await sean.ev(`!!document.querySelector('[data-project-calendar] [data-synced] [data-remove-block]')`)));
  await sean.click("button[data-tip]", "Appointment-Phone");
  await until(() => sean.ev(`!!document.querySelector('input[aria-label="Appointment date"]')`));
  await sean.fill('input[aria-label="Appointment date"]', us(D1));
  await sean.ev("document.activeElement.blur()");
  await until(() => sean.ev(`document.querySelector('input[name="appt_date"]')?.value === ${JSON.stringify(D1)}`));
  await sean.fill('select[name="appt_time"]', "2:30 PM");
  const warned = await until(() => sean.ev(`document.querySelector('[data-slot-warning]')?.innerText.replace(/\\s+/g, ' ') ?? null`));
  check("booking over it is warned about", new RegExp(`Busy 2:00 PM – 3:00 PM on ${clientName}'s calendar`).test(warned ?? ""), warned);

  section("Disconnecting");
  await client.click("[role=dialog] [data-disconnect]");
  check("my calendar is disconnected, and its busy times are off the project's calendar",
    Boolean(await until(() => sql(`select (select count(*) from public.calendar_feeds where id = ${feed}) || '/' || (select count(*) from public.calendar_blocks where project_id = ${APPT})`) === "0/0")));
  check("…and the calendar offers to sync again", Boolean(await until(async () => /^Sync my calendar$/i.test(await client.ev(`document.querySelector('[data-sync-calendar]')?.innerText.trim() ?? ''`)))));
} finally {
  browser.close();
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.activity_log where action like 'calendar.%' and created_at > now() - interval '15 minutes'`);
}

finish("calendar sync");
