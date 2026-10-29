/**
 * The calendar, easier to use without a synced calendar (Sean, Oct 2026):
 * straight to another month or year from the month's name (the Calendar
 * page, a project's calendar), and time blocked out on the same days every
 * week until a day (every Tuesday and Thursday for two months), shaded on
 * those days only, and taken off in one go; and blocked time taken off
 * wherever it shows (a day blocked out by mistake).
 *
 * Removes everything it made.
 *
 *   node tests/e2e/calendar-repeats.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CR ${Date.now()}`;
const company = Number(sql("select company_id from public.users where email='client@beacon.test'"));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code='APPT'), 1) returning id`));
const LEAD = Number(sql(`insert into public.leads (company_name, project_id, stage, result_id)
  values (${lit(`${TAG} Co`)}, ${APPT}, 'appt', public.call_result_from_text('APPT', 'Lead-No Contact')) returning id`));
const TODAY = sql("select ((now() at time zone public.business_tz())::date)::text");
const UNTIL = sql(`select (${lit(TODAY)}::date + interval '2 months')::date::text`);
// Next month, and the Tuesdays and Thursdays in it up to the last day.
const NEXT = sql(`select (date_trunc('month', ${lit(TODAY)}::date) + interval '1 month')::date::text`);
const tueThu = sql(`select string_agg(extract(day from d)::int::text, ',' order by d) from generate_series(${lit(NEXT)}::date, (${lit(NEXT)}::date + interval '1 month' - interval '1 day')::date, '1 day') d
  where extract(dow from d) in (2, 4) and d <= ${lit(UNTIL)}::date`);
const monthName = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const browser = await launchBrowser();
try {
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });

  section("Straight to another month");
  await client.go(`/calendar?project=${APPT}&view=month&d=${TODAY}`, 6000);
  await until(() => client.ev("!!document.querySelector('[data-month-jump]')"));
  check("the month's name opens its year's months", (await client.ev("document.querySelector('[data-month-jump]').textContent")).includes(monthName(TODAY)));
  await client.click("[data-month-jump]");
  await until(() => client.ev("!!document.querySelector('[data-month-jump-menu]')"));
  const year = Number(TODAY.slice(0, 4));
  check("…this year's twelve, this month picked", (await client.ev("document.querySelectorAll('[data-month-pick]').length")) === 12
    && (await client.ev(`document.querySelector('[data-month-pick="${TODAY.slice(0, 7)}"]').getAttribute('aria-pressed')`)) === "true");
  await client.click('[data-month-jump-menu] button[aria-label="Next year"]');
  check("…a year on with the arrow", Boolean(await until(async () => (await client.ev("document.querySelector('[data-month-jump-year]')?.textContent")) === String(year + 1))));
  await client.click(`[data-month-pick="${year + 1}-03"]`);
  check("…March next year, picked: the calendar goes there", Boolean(await until(async () => (await client.url()).includes(`d=${year + 1}-03-01`) && (await client.url()).includes(`project=${APPT}`)
    && (await client.ev("document.querySelector('[data-month-jump]')?.textContent ?? ''")).includes(`March ${year + 1}`))), await client.url());
  await client.click("[data-month-jump]");
  await until(() => client.ev("!!document.querySelector('[data-month-jump-menu]')"));
  await client.click("[data-month-jump-menu] button", "This month");
  check("…and This month comes back", Boolean(await until(async () => (await client.url()).includes(`d=${TODAY.slice(0, 7)}-01`))));

  section("Blocked out every Tuesday and Thursday for two months");
  await until(() => client.ev("!!document.querySelector('[data-blocked-time] [data-block-out]')"));
  await client.click("[data-blocked-time] [data-block-out]");
  await until(() => client.ev("!!document.querySelector('[data-block-form]')"));
  await client.click("[data-block-repeat]");
  await until(() => client.ev("!!document.querySelector('[data-block-weekdays]')"));
  check("Repeat every week: today's day of the week ticked, until two months on",
    (await client.ev("[...document.querySelectorAll('[data-block-weekday]')].filter((b) => b.checked).map((b) => b.value).join()")) === String(new Date(`${TODAY}T12:00:00Z`).getUTCDay())
    && (await client.ev(`document.querySelector('[data-block-form] input[name="ends_on"]').value`)) === UNTIL);
  // Just Tuesday and Thursday.
  await client.ev(`[...document.querySelectorAll('[data-block-weekday]')].forEach((b) => { if (b.checked !== ['2', '4'].includes(b.value)) b.click(); }); true`);
  await client.fill('[data-block-form] input[name="note"]', "Staff meetings");
  await client.click("[data-block-form] button[type=submit]");
  const row = await until(() => sql(`select coalesce((select starts_on || '|' || ends_on || '|' || array_to_string(weekdays, ',') || '|' || (start_time is null) from public.calendar_blocks where project_id = ${APPT}), '')`) || null);
  check("kept as one block: every Tue and Thu, all day, from today until then", row === `${TODAY}|${UNTIL}|2,4|true`, row);
  check("…listed so", Boolean(await until(async () => /Every Tue & Thu, .* · All day · Staff meetings/.test(await client.ev("document.querySelector('[data-blocked-time]')?.innerText.replace(/\\s+/g, ' ') ?? ''")))));
  await client.go(`/calendar?project=${APPT}&view=month&d=${NEXT}`, 5000);
  const cells = await until(() => client.ev("[...document.querySelectorAll('button[data-blocked]')].map((b) => b.querySelector('span span')?.textContent.trim()).join()").then((t) => t || null));
  check("next month shaded on its Tuesdays and Thursdays only", cells === tueThu, `${cells} / ${tueThu}`);

  section("Taken off in one go");
  const id = sql(`select id from public.calendar_blocks where project_id = ${APPT}`);
  await until(() => client.ev(`!!document.querySelector('[data-blocked-time] [data-block="${id}"] [data-remove-block]')`));
  await sleep(300);
  await client.click(`[data-blocked-time] [data-block="${id}"] [data-remove-block]`);
  await until(() => client.ev("!!document.querySelector('[data-confirm-dialog]')"));
  await client.click("[data-confirm-dialog] [data-confirm]");
  check("every week of it", Boolean(await until(() => sql(`select count(*) from public.calendar_blocks where project_id = ${APPT}`) === "0")));

  section("Undoing a day blocked out by mistake, wherever it shows");
  const block = (start = null, end = null) => Number(sql(`insert into public.calendar_blocks (project_id, starts_on, ends_on, start_time, end_time, note)
    values (${APPT}, ${lit(TODAY)}, ${lit(TODAY)}, ${start ? lit(start) : "null"}, ${end ? lit(end) : "null"}, 'By mistake') returning id`));
  const gone = (bid) => until(() => sql(`select count(*) from public.calendar_blocks where id = ${bid}`) === "0");
  const takeOff = async (page, sel) => {
    await until(() => page.ev(`!!document.querySelector(${JSON.stringify(sel)})`));
    await sleep(200);
    await page.click(sel);
    await until(() => page.ev("!!document.querySelector('[data-confirm-dialog]')"));
    await page.click("[data-confirm-dialog] [data-confirm]");
  };
  let bid = block();
  await client.go(`/calendar?project=${APPT}&view=month&d=${TODAY}`, 5000);
  await takeOff(client, `[data-blocked-row="${bid}"] [data-remove-block]`);
  check("the month: the day picked lists it, with a way to take it off", Boolean(await gone(bid)));
  bid = block("13:00", "15:00");
  await client.go(`/calendar?project=${APPT}&view=day&d=${TODAY}`, 5000);
  await takeOff(client, `[data-blocked-time-block="${bid}"] [data-remove-block]`);
  check("the day: hours blocked out, taken off from the band itself", Boolean(await gone(bid)));
  bid = block();
  await client.go(`/calendar?project=${APPT}&view=week&d=${TODAY}`, 5000);
  await takeOff(client, `[data-blocked-all-day] [data-blocked-time-block="${bid}"] [data-remove-block]`);
  check("the week: a whole day, from its All day row", Boolean(await gone(bid)));
  const many = Array.from({ length: 5 }, () => block());
  await client.go(`/calendar?client=${company}&view=month&d=${TODAY}`, 5000);
  await until(() => client.ev("!!document.querySelector('[data-blocks-more]')"));
  check("several calendars together: each listed can be taken off", (await client.ev("document.querySelectorAll('[data-blocked-time] [data-remove-block]').length")) === 4);
  await client.click("[data-blocks-more]");
  check("…and + more shows the rest, to take off too", Boolean(await until(async () => (await client.ev(`!!document.querySelector('[data-blocked-time] [data-block="${many[4]}"] [data-remove-block]')`)))));
  await takeOff(client, `[data-blocked-time] [data-block="${many[4]}"] [data-remove-block]`);
  check("…taken off", Boolean(await gone(many[4])));
  sql(`delete from public.calendar_blocks where project_id = ${APPT}`);

  section("A project's calendar, on a lead sheet");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await admin.go(`/leads/${LEAD}`, 6000);
  await until(() => admin.ev("!!document.querySelector('[data-project-calendar] [data-month-jump]')"));
  await admin.click("[data-project-calendar] [data-month-jump]");
  await until(() => admin.ev("!!document.querySelector('[data-month-jump-menu]')"));
  await admin.click(`[data-month-pick="${year}-12"]`);
  check("its month's name goes to another month too", Boolean(await until(async () => (await admin.ev("document.querySelector('[data-calendar-month]')?.textContent ?? ''")).includes(`December ${year}`))));
} finally {
  browser.close();
  sql(`delete from public.calendar_blocks where project_id = ${APPT}`);
  sql(`delete from public.leads where project_id = ${APPT}`);
  sql(`delete from public.projects where id = ${APPT}`);
}

finish("calendar repeats");
