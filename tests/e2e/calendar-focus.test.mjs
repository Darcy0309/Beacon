/**
 * "Open calendar" on an appointment notification opens that day with the
 * appointment highlighted and scrolled into view — only that one, even with
 * another at the same time — and the week and month views do the same.
 *
 * Works on its own project and removes everything it made.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CF-E2E ${Date.now()}`;
const DAY = "2031-03-05";
const SEAN = Number(sql("select id from public.users where email = 'sean@beacon.test'"));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Appt`)}, ${company}, (select id from public.project_types where code='APPT'), 1) returning id`));
const appt = (co, time) => {
  const lead = Number(sql(`insert into public.leads (company_name, project_id) values (${lit(`${TAG} ${co}`)}, ${project}) returning id`));
  return Number(sql(`insert into public.appointments (lead_id, user_id, appt_date, appt_time, status_id)
    values (${lead}, ${SEAN}, ${lit(DAY)}, ${lit(time)}, (select id from public.appointment_statuses where name='Scheduled')) returning id`));
};

const FOCUSED = `(() => {
  const all = [...document.querySelectorAll('[data-focused-appointment]')];
  const el = all[0];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { count: all.length, text: el.textContent, glowing: el.classList.contains('appt-focus'),
           onScreen: r.top >= 0 && r.bottom <= innerHeight };
})()`;

const browser = await launchBrowser();

try {
  appt("Early Bird Co", "8:00 AM");
  const neighbour = appt("Same Hour Co", "6:00 PM");
  const target = appt("Thornhill Late", "6:00 PM");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1280, height: 720 });

  section("From the notification list");
  await admin.go("/notifications", 3000);
  const clicked = await until(() => admin.ev(`(() => {
    const row = [...document.querySelectorAll('li[data-list-row]')].find((li) => li.textContent.includes(${JSON.stringify(`Appointment set: ${TAG} Thornhill Late`)}));
    const a = row && [...row.querySelectorAll('a')].find((x) => /Open calendar/i.test(x.textContent));
    if (!a) return false;
    a.click();
    return true;
  })()`));
  check("the notification has Open calendar", Boolean(clicked));
  await until(async () => (await admin.path()) === "/calendar");
  const day = await until(() => admin.ev(FOCUSED), { timeout: 8000 });
  check("the calendar opens on its day with that appointment highlighted", Boolean(day?.glowing) && day.text.includes("Thornhill Late"), JSON.stringify(day));
  check("…only that one, not the other at the same hour", day?.count === 1 && !day.text.includes("Same Hour"));
  await sleep(900);
  check("…scrolled into view (it is late in the day)", Boolean((await admin.ev(FOCUSED))?.onScreen), JSON.stringify(await admin.ev(FOCUSED)));
  check("the same hour's other appointment is there, plain",
    await admin.ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Same Hour Co') && !b.hasAttribute('data-focused-appointment'))`));

  section("Week and month");
  await admin.go(`/calendar?view=week&d=${DAY}&a=${target}`, 3000);
  const week = await until(() => admin.ev(FOCUSED));
  check("the week view highlights it too", week?.count === 1 && week.text.includes("Thornhill"), JSON.stringify(week));
  await admin.go(`/calendar?view=month&d=${DAY}&a=${target}`, 3000);
  const month = await until(() => admin.ev(FOCUSED));
  check("the month view opens its day, with it highlighted in the list", month?.count === 1 && month.text.includes("Thornhill Late"), JSON.stringify(month));
  await admin.go(`/calendar?view=day&d=${DAY}`, 3000);
  check("without one named, nothing is highlighted", (await admin.ev(FOCUSED)) === null);
  await admin.go(`/calendar?view=day&d=${DAY}&a=${neighbour}`, 3000);
  check("another link highlights another", Boolean((await until(() => admin.ev(FOCUSED)))?.text.includes("Same Hour Co")));
} finally {
  browser.close();
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where project_id = ${project})`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("calendar focus");
