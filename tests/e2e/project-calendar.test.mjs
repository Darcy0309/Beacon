/**
 * A project's calendar where it is needed (Sean, Oct 2026): on a lead
 * sheet, under the call results — a month at a glance, a day's appointments
 * and blocked time beside it; a warning when the slot being booked is taken
 * or blocked out; time blocked out by a manager there, and by the client's
 * own people on the Calendar page.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/project-calendar.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PC ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const result = (t, name) => Number(sql(`select id from public.call_results where project_type='${t}' and name=${lit(name)}`));
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const company = Number(sql("select company_id from public.users where email='client@beacon.test'"));
const inDays = (n) => sql(`select ((now() at time zone public.business_tz())::date + ${n})::text`);
const [D1, D2, D3] = [inDays(1), inDays(2), inDays(3)];
const us = (iso) => `${iso.slice(5, 7)}/${iso.slice(8)}/${iso.slice(0, 4)}`;
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} DBDev`)}, ${company}, ${type("DBDV")}, 1, ${APPT}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${SEAN})`);
const lead = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id, result_id) values (${lit(`${TAG} Caller Co`)}, ${DBDV}, ${SEAN}, ${result("DBDV", "Viable-CallBack")}) returning id`));
const booked = Number(sql(`insert into public.leads (company_name, project_id, stage, result_id) values (${lit(`${TAG} Booked Co`)}, ${APPT}, 'appt', ${result("APPT", "Appointment")}) returning id`));
sql(`insert into public.appointments (lead_id, project_id, appt_date, appt_time, duration_min, status_id, qa_status)
  values (${booked}, ${APPT}, ${lit(D1)}, '10:00 AM', 30, (select id from public.appointment_statuses where name='Scheduled'), 'passed')`);
sql(`insert into public.calendar_blocks (project_id, starts_on, ends_on, note) values (${APPT}, ${lit(D2)}, ${lit(D2)}, 'Office closed')`);

const browser = await launchBrowser();
const cal = (page, q) => page.ev(`document.querySelector('[data-project-calendar] ${q}')`);
const dayText = (page) => page.ev(`document.querySelector('[data-project-calendar] [data-calendar-day]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
const setDate = async (page, iso) => {
  await page.fill('input[aria-label="Appointment date"]', us(iso));
  await page.ev("document.activeElement.blur()");
  await until(() => page.ev(`document.querySelector('input[name="appt_date"]')?.value === ${JSON.stringify(iso)}`));
};
const warning = (page) => page.ev(`document.querySelector('[data-slot-warning]')?.innerText.replace(/\\s+/g, ' ') ?? null`);

try {
  section("On the lead sheet, above the call results");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await sean.go(`/leads/${lead}?project=${DBDV}`, 6000);
  check("the project's calendar is there: the appointment project's, which a DB dev project shares",
    Boolean(await until(() => sean.ev(`document.querySelector('[data-project-calendar="${APPT}"]')?.innerText.includes(${JSON.stringify(`${TAG} Appts`)})`))));
  // On top for a manager (Sean, Oct 2026: the calendar is what they use most, without scrolling down to it).
  check("…above the call results, in the same column", await sean.ev(`(() => { const r = document.querySelector('[data-project-calendar]').getBoundingClientRect(); const c = [...document.querySelectorAll('.eyebrow')].find((e) => /Call result/i.test(e.textContent)).getBoundingClientRect(); return r.top < c.top && Math.abs(r.left - c.left) < 60; })()`));
  check("the month marks the day with an appointment, and the day blocked out",
    (await sean.ev(`document.querySelector('[data-project-calendar] [data-day="${D1}"]')?.dataset.appointments`)) === "1"
    && (await sean.ev(`document.querySelector('[data-project-calendar] [data-day="${D2}"]')?.dataset.blocked`)) === "day");
  await sean.click(`[data-project-calendar] [data-day="${D1}"]`);
  check("a day clicked: what is scheduled, beside the month", Boolean(await until(async () => /10:00 AM · 30 min .*Booked Co/.test(await dayText(sean)))), await dayText(sean));
  // Oct 2026: in the dashboard's colours, one still to be confirmed said so, in yellow.
  check("…still to be confirmed: Awaiting confirmation, in the dashboard's yellow", /Awaiting confirmation/.test(await dayText(sean))
    && (await sean.ev(`document.querySelector('[data-project-calendar] [data-appointment][data-awaiting]')?.getAttribute('style') ?? ''`)).includes("--event-waiting")
    && (await sean.ev(`document.querySelector('[data-project-calendar] [data-day="${D1}"] [data-day-waiting]')?.dataset.dayWaiting`)) === "1", await dayText(sean));
  await sean.go(`/calendar?project=${APPT}&view=day&d=${D1}`, 6000);
  const block = await until(() => sean.ev(`(() => { const b = document.querySelector('button[data-awaiting]'); return b ? (b.getAttribute('aria-label') ?? '') + ' | ' + (b.getAttribute('style') ?? '') : null; })()`));
  check("on the full calendar too: the day's appointment marked awaiting confirmation, tinted yellow", /awaiting confirmation/.test(block ?? "") && /--event-waiting/.test(block ?? ""), block);
  await sean.go(`/leads/${lead}?project=${DBDV}`, 6000);
  await until(() => sean.ev(`!!document.querySelector('[data-project-calendar] [data-day="${D2}"]')`));
  await sean.click(`[data-project-calendar] [data-day="${D2}"]`);
  check("…or that it is blocked out, and why", Boolean(await until(async () => /Blocked · All day .*Office closed/.test(await dayText(sean)))), await dayText(sean));

  section("Blocking out time");
  await sean.click(`[data-project-calendar] [data-day="${D3}"]`);
  await sean.click("[data-project-calendar] [data-block-out]");
  await until(() => sean.ev(`!!document.querySelector('[data-block-form]')`));
  await sean.ev(`document.querySelector('[data-block-form] input[type=checkbox][name="all_day"]').click()`);
  await until(() => sean.ev(`!!document.querySelector('[data-block-form] select[name="start_time"]')`));
  await sean.fill('[data-block-form] input[name="note"]', "Staff meeting");
  await sean.click("[data-block-form] button[type=submit]");
  check("a manager blocks 10 AM – 1 PM on a day",
    Boolean(await until(() => sql(`select to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI') from public.calendar_blocks where project_id = ${APPT} and starts_on = ${lit(D3)}`) === "10:00-13:00")));
  check("…and it shows on the calendar at once", Boolean(await until(async () => /Blocked · 10:00 AM – 1:00 PM .*Staff meeting/.test(await dayText(sean))))
    && (await sean.ev(`document.querySelector('[data-project-calendar] [data-day="${D3}"]')?.dataset.blocked`)) === "part", await dayText(sean));

  section("A warning when the slot is taken");
  await sean.click("button[data-tip]", "Appointment-Phone");
  await until(() => sean.ev(`!!document.querySelector('input[aria-label="Appointment date"]')`));
  await setDate(sean, D1);
  await sean.fill('select[name="appt_time"]', "10:00 AM");
  check("over an appointment already there: says which", Boolean(await until(async () => /taken on this project's calendar.*Already booked: 10:00 AM .*Booked Co/.test((await warning(sean)) ?? ""))), await warning(sean));
  check("…a warning only: the appointment can still be saved", /You can still set it/.test((await warning(sean)) ?? "") && !(await sean.ev(`[...document.querySelectorAll('form button[type=submit]')].some((b) => b.disabled)`)));
  await sean.fill('select[name="appt_time"]', "3:00 PM");
  check("a free time: no warning", Boolean(await until(async () => (await warning(sean)) === null)));
  await setDate(sean, D2);
  check("on a day blocked out: says so", Boolean(await until(async () => /Blocked out all day \(Office closed\)/.test((await warning(sean)) ?? ""))), await warning(sean));
  await setDate(sean, D3);
  await sean.fill('select[name="appt_time"]', "12:30 PM");
  check("in a blocked time of day", Boolean(await until(async () => /Blocked out 10:00 AM – 1:00 PM \(Staff meeting\)/.test((await warning(sean)) ?? ""))), await warning(sean));

  section("The client's own people");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await client.go(`/calendar?project=${APPT}&view=month&d=${D2}`, 6000);
  const bar = () => client.ev(`document.querySelector('[data-blocked-time]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
  check("the Calendar page opens a project's calendar: its blocked time in a line, the day shaded in the month",
    Boolean(await until(async () => /All day · Office closed/.test(await bar()) && /10:00 AM – 1:00 PM · Staff meeting/.test(await bar())))
    && Boolean(await client.ev(`[...document.querySelectorAll('button[data-blocked="day"]')].some((b) => b.getAttribute('aria-label').includes('blocked out'))`)), await bar());
  check("…one toolbar, not a second calendar", !(await client.ev(`!!document.querySelector('[data-project-calendar]')`)));

  section("What is blocked, on the day");
  // The month marks a day "Part" or "Blocked"; the day itself says which hours, and why.
  const part = sql(`select starts_on::text from public.calendar_blocks where project_id = ${APPT} and note = 'Staff meeting'`);
  const pickDay = async (iso) => {
    await client.go(`/calendar?project=${APPT}&view=month&d=${iso}`, 5000);
    await until(() => client.ev(`!![...document.querySelectorAll('button[aria-pressed]')].find((b) => b.querySelector('span span')?.textContent.trim() === '${Number(iso.slice(8))}')`));
    if (!(await client.ev(`[...document.querySelectorAll('button[aria-pressed="true"]')].some((b) => b.querySelector('span span')?.textContent.trim() === '${Number(iso.slice(8))}')`)))
      await client.ev(`[...document.querySelectorAll('button[aria-pressed]')].find((b) => b.querySelector('span span')?.textContent.trim() === '${Number(iso.slice(8))}').click()`);
    return until(() => client.ev(`[...document.querySelectorAll('[data-blocked-row]')].map((r) => r.innerText.replace(/\\s+/g, ' ')).join(' | ') || null`));
  };
  const partRow = await pickDay(part);
  check("a day partly blocked lists the hours and the reason", /Blocked · 10:00 AM – 1:00 PM/.test(partRow ?? "") && /Staff meeting/.test(partRow ?? ""), partRow);
  check("…and counts it beside the appointments", /0 appointments · 1 blocked/i.test(await client.ev(`document.body.innerText`)) && /No appointments on /.test(await client.ev(`document.body.innerText`)));
  const dayRow = await pickDay(D2);
  check("a day blocked out says all day, and why", /Blocked · All day/.test(dayRow ?? "") && /Office closed/.test(dayRow ?? ""), dayRow);
  await client.go(`/calendar?project=${APPT}&view=day&d=${part}`, 5000);
  const band = await until(() => client.ev(`(() => { const b = document.querySelector('[data-blocked-time-block]'); return b ? b.innerText.replace(/\\s+/g, ' ') + ' | ' + Math.round(b.getBoundingClientRect().height) : null; })()`));
  check("the Day view bands the blocked hours: three hours tall, saying when and why", /Blocked · 10:00 AM – 1:00 PM/.test(band ?? "") && /Staff meeting/.test(band ?? "") && / \| 168$/.test(band ?? ""), band);
  await client.go(`/calendar?project=${APPT}&view=week&d=${D2}`, 5000);
  const week = await until(() => client.ev(`(() => { const all = document.querySelector('[data-blocked-all-day]'); return all ? all.innerText.replace(/\\s+/g, ' ') + ' | ' + document.querySelectorAll('[data-blocked-time-block]').length : null; })()`));
  check("the Week view heads a day blocked out with “All day”, and bands the rest", /All day/i.test(week ?? "") && /Blocked · Office closed/.test(week ?? "") && Number((week ?? "").split(" | ")[1]) >= 1, week);
  if (process.env.SHOTS) await client.screenshot(`${process.env.SHOTS}/calendar-week-blocked.png`);
  await client.go(`/calendar?project=${APPT}&view=month&d=${D2}`, 6000);
  await until(async () => /All day · Office closed/.test(await bar()));
  await client.click("[data-blocked-time] [data-block-out]");
  await until(() => client.ev(`!!document.querySelector('[data-block-form]')`));
  await client.click("[data-block-form] button[type=submit]");
  const TODAY = inDays(0);
  const mine = await until(() => sql(`select id from public.calendar_blocks where project_id = ${APPT} and starts_on = ${lit(TODAY)} and start_time is null`) || null);
  check("they block out a whole day", Boolean(mine));
  await until(() => client.ev(`!!document.querySelector('[data-blocked-time] [data-block="${mine}"] [data-remove-block]')`));
  await sleep(300);
  await client.click(`[data-blocked-time] [data-block="${mine}"] [data-remove-block]`);
  const asked = await until(() => client.ev(`document.querySelector('[data-confirm-dialog]')?.innerText ?? null`));
  check("taking it off asks first", /Take this block off the calendar\?/.test(asked ?? "") && sql(`select count(*) from public.calendar_blocks where id = ${mine}`) === "1", asked);
  await client.click("[data-confirm-dialog] [data-confirm]");
  check("…and take it off again", Boolean(await until(() => sql(`select count(*) from public.calendar_blocks where id = ${mine}`) === "0")));
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await admin.go(`/projects/${DBDV}`, 6000);
  check("the project's calendar tile shades the day blocked out", Boolean(await until(() => admin.ev(`document.querySelector('[data-calendar-tile] [data-tile-day="${D2}"]')?.dataset.blocked === 'day'`))));
} finally {
  browser.close();
  sql(`delete from public.leads where id in (${lead}, ${booked})`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.activity_log where action like 'calendar.%' and created_at > now() - interval '15 minutes'`);
}

finish("project calendar");
