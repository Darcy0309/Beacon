/**
 * Rows two and three of the account manager's dashboard (Sean, Oct 2026),
 * end to end:
 *
 *   Daily Production (in place of Lead Volume): the leads and appointments
 *   developed on a day (today to begin with) against the day's goal, set
 *   there; hours worked, calls, start time; a day picked from a calendar,
 *   or the pay period, week or month around it. Administrators see every
 *   manager over the same choices.
 *
 *   Today's Schedule: the manager's own calendar — appointments they set
 *   (awaiting confirmation or confirmed), their reminders, what
 *   administrators sent them — a month on the left, the day's list on the
 *   right; an appointment or reminder moves by dragging it onto a day, or
 *   with Move for a new day and time.
 *
 *   Recent Leads & Appointments: what the manager developed on a day, week
 *   or pay period: Client, Project, Company, Type, Developed; searchable.
 *
 *   Daily Team Production (in place of Appointments by Rep): every active
 *   manager's leads and appointments today.
 *
 * Puts back everything it changed.
 *
 *   node tests/e2e/manager-dashboard-rows.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `MDR-E2E ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const ADMIN = userId("admin@beacon.test");
const today = sql("select ((now() at time zone public.business_tz())::date)::text");
const inDays = (n) => sql(`select (${lit(today)}::date + ${n})::text`);
// Days still in this month on show, so the calendar needs no paging.
const sameMonth = (iso) => iso.slice(0, 7) === today.slice(0, 7);
const dayA = [1, 2, -26].map(inDays).find((d) => sameMonth(d) && d >= today) ?? today;
const dayB = [2, 3, 1].map(inDays).find((d) => sameMonth(d) && d >= today && d !== dayA) ?? inDays(1);
const goalsBefore = sql(`select coalesce(json_agg(g), '[]') from public.daily_goals g where user_id = ${SEAN} and day = ${lit(today)}`);
sql(`delete from public.daily_goals where user_id = ${SEAN} and day = ${lit(today)}`);

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (project_id, company_name, contact_name, phone) values (${project}, ${lit(`${TAG} Plumbing`)}, 'Dana Cole', '(602) 555-0177') returning id`));
const lead2 = Number(sql(`insert into public.leads (project_id, company_name, phone) values (${project}, ${lit(`${TAG} Roofing`)}, '(480) 555-0199') returning id`));
const hot = sql("select id from public.call_results where project_type = 'DBDV' and name = 'Lead-Hot Lead'");
const phoneAppt = sql("select id from public.call_results where project_type = 'DBDV' and name = 'Appointment-Phone'");
const call1 = Number(sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, result_id) values (${lead}, ${project}, ${SEAN}, now(), ${hot}) returning id`));
const call2 = Number(sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, result_id) values (${lead2}, ${project}, ${SEAN}, now(), ${phoneAppt}) returning id`));
sql(`insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, created_at) values
  (${SEAN}, ${project}, ${lead}, ${call1}, 'lead', 10, now()), (${SEAN}, ${project}, ${lead2}, ${call2}, 'appointment', 40, now())`);
const scheduled = sql("select id from public.appointment_statuses where name = 'Scheduled'");
const appt = Number(sql(`insert into public.appointments (lead_id, user_id, appt_date, appt_time, status_id, project_id, qa_status)
  values (${lead}, ${SEAN}, ${lit(dayA)}, '9:30 AM', ${scheduled}, ${project}, 'passed') returning id`));
const rem = Number(sql(`insert into public.reminders (lead_id, user_id, remind_at, note)
  values (${lead2}, ${SEAN}, (${lit(dayA)}::date + time '11:00') at time zone public.business_tz(), ${lit(`${TAG} ask for Henry`)}) returning id`));
const note = Number(sql(`insert into public.notifications (user_id, sender_id, kind, title, body)
  values (${SEAN}, ${ADMIN}, 'message', ${lit(`${TAG} team meeting`)}, 'At noon') returning id`));

const browser = await launchBrowser();
try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1500 });
  await sean.go("/", 5000);
  const card = (sel) => sean.ev(`document.querySelector(${JSON.stringify(sel)})?.innerText.replace(/\\s+/g, ' ') ?? null`);

  section("Daily Production, where Lead Volume was");
  const prod = await until(() => card("[data-production-card]"));
  check("the day so far: leads and appointments, hours worked, calls, start time", /So far today/.test(prod ?? "") && /LEADS\s*1/i.test(prod) && /APPOINTMENTS\s*1/i.test(prod) && /Hours worked/i.test(prod) && /Calls/i.test(prod) && /Started/i.test(prod), prod);
  check("…no Lead Volume chart for a manager", !/Lead Volume/i.test(await sean.text()));
  check("the tile above leads down to setting the goal", Boolean(await sean.ev(`!!document.querySelector('[data-panel] [data-set-goal-link]')`)));
  await sean.fill('[data-production-card] input[name="leads_goal"]', "4");
  await sean.fill('[data-production-card] input[name="appts_goal"]', "2");
  await sean.click("[data-production-card] [data-daily-goals-form] button[type=submit]");
  check("the goal is set on the card, and it tracks the % reached",
    Boolean(await until(async () => /of 4 · 25%/.test((await card("[data-production-card]")) ?? "") && /of 2 · 50%/.test((await card("[data-production-card]")) ?? ""))), await card("[data-production-card]"));
  await sean.click('[data-period-switch="dp"] a', "Week");
  check("…or the week around the day: the days worked and each day's bars",
    Boolean(await until(async () => /days? worked/.test((await card("[data-production-card]")) ?? "") && (await sean.ev(`!!document.querySelector('[data-production-card] [data-day-bars]')`)))), await card("[data-production-card]"));
  for (const [label, re] of [["Pay", /Pay/], ["Month", /Month/]]) {
    await sean.click('[data-period-switch="dp"] a', label);
    check(`…the ${label === "Pay" ? "pay period" : "month"} too`, Boolean(await until(async () => re.test((await sean.ev(`document.querySelector('[data-period-switch="dp"] [aria-current]')?.textContent`)) ?? ""))));
  }
  await sean.click('[data-period-switch="dp"] a', "Day");
  await until(async () => /So far today/.test((await card("[data-production-card]")) ?? ""));
  await sean.click('[data-view-nav="dd"] [data-view-prev]');
  check("a day before, by the arrow (a calendar picks any day)", Boolean(await until(async () => /That day/.test((await card("[data-production-card]")) ?? ""))) && /dd=/.test(await sean.url()), await sean.url());
  await sean.click('[data-view-nav="dd"] a', "Today");
  check("…and back to today", Boolean(await until(async () => /So far today/.test((await card("[data-production-card]")) ?? ""))));

  section("Today's Schedule: the manager's own calendar");
  check("how many appointments they set still wait for confirmation", /\d+ awaiting confirmation/i.test((await card("[data-my-schedule]")) ?? ""));
  await sean.click(`[data-my-schedule] [data-day="${dayA}"]`);
  const list = await until(async () => {
    const t = await card(`[data-schedule-day="${dayA}"]`);
    return t && t.includes(`${TAG} Plumbing`) && t.includes(`${TAG} Roofing`) ? t : null;
  });
  check("a day clicked: the appointment they set, awaiting confirmation, and their reminder", Boolean(list) && /Awaiting confirmation/i.test(list) && /Call back/.test(list), list ?? (await card("[data-my-schedule]")));
  await sean.click(`[data-my-schedule] [data-day="${today}"]`);
  check("…and today, what an administrator sent them", Boolean(await until(async () => ((await card(`[data-schedule-day="${today}"]`)) ?? "").includes(`${TAG} team meeting`))), await card(`[data-schedule-day="${today}"]`));

  // Drag the appointment onto another day, as the mouse would.
  await sean.click(`[data-my-schedule] [data-day="${dayA}"]`);
  await until(() => sean.ev(`!!document.querySelector('[data-schedule-item="a${appt}"]')`));
  await sean.ev(`(() => {
    const dt = new DataTransfer();
    const item = document.querySelector('[data-schedule-item="a${appt}"]');
    item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    return true;
  })()`);
  await sleep(150);
  await sean.ev(`(() => {
    const dt = new DataTransfer();
    const day = document.querySelector('[data-my-schedule] [data-day="${dayB}"]');
    day.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    day.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return true;
  })()`);
  check("an appointment dragged onto another day moves there, at its time",
    Boolean(await until(() => sql(`select appt_date || ' ' || appt_time from public.appointments where id = ${appt}`) === `${dayB} 9:30 AM`, { timeout: 8000 })),
    sql(`select appt_date || ' ' || appt_time from public.appointments where id = ${appt}`));
  check("…and the list follows it to that day", Boolean(await until(async () => ((await card(`[data-schedule-day="${dayB}"]`)) ?? "").includes(`${TAG} Plumbing`))));

  await sean.click(`[data-my-schedule] [data-day="${dayA}"]`);
  await until(() => sean.ev(`!!document.querySelector('[data-move="r${rem}"]')`));
  await sean.click(`[data-move="r${rem}"]`);
  await until(() => sean.ev(`!!document.querySelector('[data-move-form] select[name="time"]')`));
  await sean.fill('[data-move-form] select[name="time"]', "3:00 PM");
  await sean.click("[data-move-form] button[type=submit]", "Move");
  check("a reminder moves to a new time with Move",
    Boolean(await until(() => sql(`select to_char(remind_at at time zone public.business_tz(), 'YYYY-MM-DD FMHH12:MI AM') from public.reminders where id = ${rem}`) === `${dayA} 3:00 PM`, { timeout: 8000 })),
    sql(`select to_char(remind_at at time zone public.business_tz(), 'YYYY-MM-DD FMHH12:MI AM') from public.reminders where id = ${rem}`));

  section("Recent Leads & Appointments");
  const recent = await card("[data-developed]");
  const headers = await sean.ev(`[...document.querySelectorAll('[data-developed] thead th')].map((t) => t.textContent.trim())`);
  check("columns: Client, Project, Company, Type, Developed", JSON.stringify(headers) === JSON.stringify(["Client", "Project", "Company", "Type", "Developed"]), JSON.stringify(headers));
  check("today's: the hot lead and the phone appointment they developed, with client and project",
    recent.includes(`${TAG} Insurance`) && recent.includes(`${TAG} DBDev`) && /Hot Lead/.test(recent) && /Phone Appointment/.test(recent), recent);
  await sean.fill('[data-developed] input[type="search"], [data-developed] input', "4805550199");
  check("searchable by phone", Boolean(await until(async () => {
    const rows = await sean.ev(`[...document.querySelectorAll('[data-developed-row]')].map((r) => r.innerText).join('|')`);
    return rows.includes(`${TAG} Roofing`) && !rows.includes(`${TAG} Plumbing`);
  })));
  await sean.click('[data-period-switch="rl"] a', "Week");
  check("…and by week or pay period instead of the day", Boolean(await until(async () => (await sean.ev(`document.querySelector('[data-period-switch="rl"] [aria-current]')?.textContent`)) === "Week")));

  section("Daily Team Production, where Appointments by Rep was");
  const team = await card("[data-team-production]");
  check("every active manager, with today's leads and appointments", /Mike/.test(team) && /Rachel/.test(team) && new RegExp(`Sean Fitzgerald\\s*you\\s*\\d+\\s*\\d+`).test(team), team);
  check("…no Appointments by Rep for a manager", !/Appointments by Rep/i.test(await sean.text()));

  section("The administrator's Daily Production");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go("/?dp=month", 5000);
  const table = await until(() => admin.ev(`document.querySelector('[data-daily-production]')?.innerText ?? null`));
  check("every manager over the month: days worked, usual start, calls, leads, appointments, hours", /Days worked/i.test(table ?? "") && /Usual start/i.test(table) && /Sean/.test(table), table);
  await admin.click('[data-period-switch="dp"] a', "Day");
  check("…or a day: when each started", Boolean(await until(async () => /Started/i.test((await admin.ev(`document.querySelector('[data-daily-production]')?.innerText`)) ?? ""))));
} finally {
  browser.close();
  sql(`delete from public.daily_goals where user_id = ${SEAN} and day = ${lit(today)}`);
  for (const g of JSON.parse(goalsBefore)) sql(`insert into public.daily_goals (user_id, day, leads_goal, appts_goal) values (${g.user_id}, ${lit(g.day)}, ${g.leads_goal ?? "null"}, ${g.appts_goal ?? "null"})`);
  sql(`delete from public.notifications where id = ${note} or title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.reminders where lead_id in (${lead}, ${lead2})`);
  sql(`delete from public.pay_events where project_id = ${project}`);
  sql(`delete from public.appointments where lead_id in (${lead}, ${lead2})`);
  sql(`delete from public.call_records where lead_id in (${lead}, ${lead2})`);
  sql(`delete from public.activity_log where entity in ('appointment', 'reminder') and entity_id in (${appt}, ${rem})`);
  sql(`delete from public.leads where id in (${lead}, ${lead2})`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("manager dashboard rows");
