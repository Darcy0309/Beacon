/**
 * Counts that mean what they say, and the rest of Sean's Oct 2026 notes, in
 * the browser:
 *
 *   Projects          Leads Across Campaigns counts leads, "in the
 *                     pipeline"; a project's Leads are leads, with what it
 *                     still has to call beside them
 *   Account Managers  leads held apart from the names still to call
 *   Dashboard         Leads and Appointments developed by the managers, by
 *                     day, pay period, week or month; the managers' calendar
 *                     in place of Today's Schedule, with All
 *   Users             work phone and extension, mobile, state, time zone,
 *                     date of birth and start date
 *   Lead email        begun with the greeting, signed with the manager's
 *                     name, the client and their work phone
 *
 * Puts back everything it changed.
 *
 *   node tests/run.mjs tests/e2e/admin-counts.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `AC ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const MIKE = Number(sql("select id from public.users where email='mike@beacon.test'"));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${SEAN})`);
const lead = Number(sql(`insert into public.leads (company_name, contact_name, email, project_id, assigned_user_id) values (${lit(`${TAG} Delta Door`)}, 'Robert Huff', 'robert@delta.test', ${APPT}, ${SEAN}) returning id`));
const seanBefore = JSON.parse(sql(`select row_to_json(u) from (select phone, phone_ext from public.users where id = ${SEAN}) u`));
const mikeBefore = JSON.parse(sql(`select row_to_json(u) from (select mobile, state, timezone_id, birth_date, start_date from public.users where id = ${MIKE}) u`));
sql(`update public.users set phone = '(602) 555-0100', phone_ext = '203' where id = ${SEAN}`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1100 });
  const tile = (label) => admin.ev(`(() => { const t = [...document.querySelectorAll('.stat-label')].find((e) => e.textContent.trim() === ${JSON.stringify(label)})?.closest('[data-panel], [data-stat-tile], .group'); return t ? t.innerText.replace(/\\s+/g, ' ') : null; })()`);

  section("Projects");
  await admin.go("/projects", 5000);
  const leads = Number(sql("select count(*) from public.leads where stage = 'appt'"));
  const pipeline = await until(() => tile("Leads Across Campaigns"));
  check("Leads Across Campaigns counts the leads, in the pipeline", (pipeline ?? "").includes(leads.toLocaleString()) && /in the pipeline/i.test(pipeline ?? "") && !/on the book/i.test(pipeline ?? ""), `${pipeline} (${leads} leads)`);
  check("…and the database development count reads as the tile's heading does", await admin.ev(`document.querySelector('[data-dbdev-count]')?.classList.contains('stat-label') ?? false`));
  const heads = await admin.ev(`[...document.querySelectorAll('th')].map((t) => t.textContent.trim())`);
  check("each project's Leads, with what it still has to call beside them", heads.includes("Leads") && heads.includes("To call"), JSON.stringify(heads));

  section("Account Managers");
  await admin.go("/account-managers", 5000);
  const assigned = await until(() => tile("Leads Assigned"));
  check("leads held, and the names still to call counted apart", /names still to call/i.test(assigned ?? "") && await admin.ev(`!!document.querySelector('[data-manager-names]') && !!document.querySelector('[data-manager-leads]')`), assigned);

  section("Dashboard");
  await admin.go("/", 6000);
  const leadTile = await until(() => tile("Leads"));
  check("Leads: developed by the managers", /By managers/i.test(leadTile ?? ""), leadTile);
  const switches = await admin.ev(`[...document.querySelectorAll('[data-period-switch="tl"] a')].map((a) => a.textContent.trim())`);
  check("…by day, pay period, week or month", JSON.stringify(switches) === JSON.stringify(["Day", "Pay", "Week", "Month"]), JSON.stringify(switches));
  check("Appointments too", /By managers/i.test((await tile("Appointments")) ?? "") && await admin.ev(`document.querySelectorAll('[data-period-switch="ta"] a').length === 4`));
  await admin.click('[data-period-switch="tl"] a', "Day");
  check("a period picked is kept in the address", Boolean(await until(async () => (await admin.url()).includes("tl=day"))));
  check("the managers' calendar in place of Today's Schedule, with All for every appointment",
    await admin.ev(`!!document.querySelector('[data-my-schedule][data-stacked], [data-my-schedule] [data-stacked]') && document.querySelector('[data-schedule-all]')?.getAttribute('href') === '/appointments'`));

  section("Users");
  await admin.go(`/users?q=mike`, 5000);
  await admin.click("[data-user-link]", "Mike");
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] input[name="start_date"]')`));
  const fields = await admin.ev(`[...document.querySelectorAll('[role=dialog] [name]')].map((f) => f.name)`);
  check("work phone and extension, mobile, state, time zone, date of birth and start date",
    ["phone", "phone_ext", "mobile", "state", "timezone_id", "birth_date", "start_date"].every((f) => fields.includes(f)), JSON.stringify(fields));
  await admin.fill('[role=dialog] input[name="mobile"]', "(480) 555-0199");
  await admin.fill('[role=dialog] input[name="state"]', "arizona");
  await admin.fill('[role=dialog] select[name="timezone_id"]', "3");
  await admin.fill('[role=dialog] input[name="start_date"]', "2021-03-15");
  await admin.click("[role=dialog] button[type=submit]");
  check("…saved, the state written as its code", Boolean(await until(() => sql(`select concat_ws('|', mobile, state, timezone_id, start_date) from public.users where id = ${MIKE}`) === "(480) 555-0199|AZ|3|2021-03-15")),
    sql(`select concat_ws('|', mobile, state, timezone_id, start_date) from public.users where id = ${MIKE}`));

  section("A lead email, signed");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1500, height: 1100 });
  await sean.go(`/leads/${lead}`, 5000);
  await sean.ev(`document.querySelector('[data-email-lead]')?.scrollIntoView({ block: 'center' })`);
  await sean.mouseClick("[data-email-lead]");
  const body = await until(() => sean.ev(`document.querySelector('[role=dialog] textarea[name="body"]')?.value ?? null`));
  check("begun with the greeting, and signed with the manager, the client and their work phone",
    body === `Hi Robert,\n\n\n\nRegards,\nSean Fitzgerald\n${TAG} Capital Insurance\n(602) 555-0100 ext. 203`, JSON.stringify(body));
} finally {
  browser.close();
  sql(`update public.users set phone = ${seanBefore.phone ? lit(seanBefore.phone) : "null"}, phone_ext = ${seanBefore.phone_ext ? lit(seanBefore.phone_ext) : "null"} where id = ${SEAN}`);
  sql(`update public.users set mobile = ${mikeBefore.mobile ? lit(mikeBefore.mobile) : "null"}, state = ${mikeBefore.state ? lit(mikeBefore.state) : "null"},
    timezone_id = ${mikeBefore.timezone_id ?? "null"}, birth_date = ${mikeBefore.birth_date ? lit(mikeBefore.birth_date) : "null"}, start_date = ${mikeBefore.start_date ? lit(mikeBefore.start_date) : "null"} where id = ${MIKE}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}
finish("admin counts");
