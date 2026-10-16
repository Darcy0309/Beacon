/**
 * The Account Managers page over days chosen (Sean, Oct 2026): the pay
 * period to begin with, or a day, a week, a month or days of one's own;
 * each manager's leads called (at appointment setting, each once),
 * appointments set, and the appointments and leads of theirs marked invalid,
 * on their card and totalled on the tiles; what they hold now (clients,
 * leads held) as it stands.
 *
 * Removes everything it made.
 *
 *   node tests/run.mjs tests/e2e/account-managers-page.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `AMP ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const [SEAN, MIKE] = [userId("sean@beacon.test"), userId("mike@beacon.test")];
const type = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const result = (t, name) => Number(sql(`select id from public.call_results where project_type=${lit(t)} and name=${lit(name)}`));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const lead = (name, extra = "") => Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id${extra ? ", dbdv_user_id" : ""})
  values (${lit(`${TAG} ${name}`)}, ${APPT}, ${SEAN}${extra ? `, ${extra}` : ""}) returning id`));

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1200 });
  const figure = (user, name) => admin.ev(`Number((document.querySelector('[data-manager-card="${user}"] [data-manager-figure="${name}"] .text-lg')?.textContent ?? 'NaN').replace(/,/g, ''))`);
  const card = async (user) => Object.fromEntries(await Promise.all(["called", "appts", "invalid-appts", "invalid-leads"].map(async (n) => [n, await figure(user, n)])));
  const tile = (label) => admin.ev(`(() => { const t = [...document.querySelectorAll('.stat-label')].find((e) => e.textContent.trim() === ${JSON.stringify(label)})?.closest('[data-panel], [data-stat-tile], .group'); return t ? t.innerText.replace(/\\s+/g, ' ') : null; })()`);

  section("The pay period, to begin with");
  await admin.go("/account-managers", 5000);
  await until(() => admin.ev(`!!document.querySelector('[data-manager-card="${SEAN}"]')`));
  const switches = await admin.ev(`[...document.querySelectorAll('[data-period-switch="p"] a')].map((a) => [a.textContent.trim(), a.getAttribute('aria-current')])`);
  check("Day, Pay, Week and Month, the pay period chosen", JSON.stringify(switches) === JSON.stringify([["Day", null], ["Pay", "true"], ["Week", null], ["Month", null]]), JSON.stringify(switches));
  check("…a range of one's own beside them", await admin.ev(`!!document.querySelector('[data-manager-custom]')`));
  check("six tiles: managers, clients, appointments set, leads called, invalid appointments and invalid leads",
    (await Promise.all(["Account Managers", "Clients Covered", "Appointments Set", "Leads Called", "Invalid Appointments", "Invalid Leads"].map(tile))).every(Boolean));
  const before = { sean: await card(SEAN), mike: await card(MIKE) };

  // Today: Sean calls one lead at appointment setting twice, sets an appointment that is marked invalid,
  // and marks invalid a lead Mike developed.
  const called = lead("Called Twice");
  const bad = lead("Bad Lead", MIKE);
  const call = (l, r) => Number(sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, result_id, stage) values (${l}, ${APPT}, ${SEAN}, now(), ${r}, 'appt') returning id`));
  call(called, result("APPT", "Lead-Left Message"));
  const set = call(called, result("APPT", "Appointment"));
  call(bad, result("APPT", "Lead-Invalid"));
  sql(`insert into public.appointments (lead_id, user_id, project_id, appt_date, appt_time, invalid_at)
    values (${called}, ${SEAN}, ${APPT}, (now() at time zone public.business_tz())::date + 2, '10:00 AM', now())`);
  sql(`insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, created_at) values (${SEAN}, ${APPT}, ${called}, ${set}, 'appointment', 40, now())`);

  await admin.go("/account-managers", 5000);
  const after = { sean: await until(async () => { const c = await card(SEAN); return c.called === before.sean.called + 2 ? c : null; }) ?? await card(SEAN), mike: await card(MIKE) };
  check("Sean: the two leads he called, each once", after.sean.called === before.sean.called + 2, JSON.stringify({ before: before.sean, after: after.sean }));
  check("…the appointment he set", after.sean.appts === before.sean.appts + 1, JSON.stringify(after.sean));
  check("…and marked invalid, his", after.sean["invalid-appts"] === before.sean["invalid-appts"] + 1, JSON.stringify(after.sean));
  check("the invalid lead is Mike's, who developed it", after.mike["invalid-leads"] === before.mike["invalid-leads"] + 1 && after.sean["invalid-leads"] === before.sean["invalid-leads"],
    JSON.stringify({ mike: after.mike, sean: after.sean }));
  check("the tiles total them, with a line a day", /Invalid Leads [1-9]/i.test((await tile("Invalid Leads")) ?? "") && /Invalid Appointments [1-9]/i.test((await tile("Invalid Appointments")) ?? ""),
    `${await tile("Invalid Leads")} | ${await tile("Invalid Appointments")}`);

  section("A day, or days of one's own");
  await admin.click('[data-period-switch="p"] a', "Day");
  await until(async () => (await admin.url()).includes("p=day"));
  check("today alone counts them too", Boolean(await until(async () => (await figure(SEAN, "invalid-appts")) >= 1)));
  await admin.go("/account-managers?p=custom&pf=2025-01-01&pt=2025-01-31", 5000);
  const old = await until(async () => { const c = await card(SEAN); return Number.isFinite(c.called) ? c : null; });
  check("January 2025: none of it", old && old.called === 0 && old.appts === 0 && old["invalid-appts"] === 0, JSON.stringify(old));
  check("…the range said beside the picker", /Jan 1/.test((await admin.ev(`document.querySelector('[data-manager-range]')?.textContent`)) ?? ""));
} finally {
  browser.close();
  const like = lit(`${TAG}%`);
  sql(`delete from public.pay_events where project_id = ${APPT}`);
  sql(`delete from public.appointments where project_id = ${APPT}`);
  sql(`delete from public.notifications where body like ${lit(`%${TAG}%`)} or title like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.call_records where project_id = ${APPT}`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("account managers page");
