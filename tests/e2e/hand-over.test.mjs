/**
 * Hand over work, from the Users page (Sean, Oct 2026): an administrator
 * opens a leaving manager's menu, sees what they still hold, chooses who
 * takes it over, and hands it over; then disables them as usual.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/hand-over.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const RUN = Date.now();
const TAG = `HO-E2E ${RUN}`;
const RACHEL = Number(sql(`select id from public.users where email = 'rachel@beacon.test'`));
const EMAIL = `ho.e2e.${RUN}@beacon.test`;
const JEN = Number(sql(`insert into public.users (email, first_name, last_name, role, status)
  values (${lit(EMAIL)}, 'Jen', ${lit(`Leaving ${RUN}`)}, 'manager', 'active') returning id`));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${JEN})`);
const names = [1, 2, 3].map((i) => Number(sql(`insert into public.leads (company_name, project_id, stage, assigned_user_id, result_id)
  values (${lit(`${TAG} ${i}`)}, ${APPT}, 'appt', ${JEN}, public.call_result_from_text('APPT', 'Lead-Viable')) returning id`)));
sql(`insert into public.reminders (lead_id, user_id, remind_at, note) values (${names[0]}, ${JEN}, now() + interval '1 day', 'Call back')`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1400, height: 1000 });

  section("From a leaving manager's menu");
  await admin.go(`/users?q=${encodeURIComponent(EMAIL)}`, 5000);
  await admin.pointer(`button[aria-label="Actions for Jen Leaving ${RUN}"]`);
  await sleep(300);
  check("their menu has Hand over work", await admin.menuItem("Hand over work"));
  const held = await until(() => admin.ev("document.querySelector('[data-hand-over-held] ul')?.innerText.replace(/\\s+/g, ' ') ?? null"));
  check("it says what they still hold", /1 project/.test(held ?? "") && /3 names/.test(held ?? "") && /1 reminder/.test(held ?? ""), held);
  check("…and that what they did stays theirs", /stays theirs/.test(await admin.ev("document.querySelector('[data-hand-over-dialog]').innerText")));
  check("…not to be handed over before someone is chosen", await admin.ev("document.querySelector('[data-hand-over-go]').disabled"));
  await admin.fill("[data-hand-over-to]", String(RACHEL));
  await admin.click("[data-hand-over-go]");
  const said = await admin.waitToast(/handed over/, 10000);
  check("handed over, and said so", /3 names/.test(said ?? "") && /1 reminder/.test(said ?? ""), said);
  check("…the names, the project and the reminder are Rachel's",
    Boolean(await until(() => sql(`select count(*) from public.leads where id in (${names.join(",")}) and assigned_user_id = ${RACHEL}`) === "3"))
      && sql(`select ae_user_id from public.project_assignments where project_id = ${APPT}`) === String(RACHEL)
      && sql(`select count(*) from public.reminders where lead_id = ${names[0]} and user_id = ${RACHEL}`) === "1");
} finally {
  browser.close();
  sql(`delete from public.notifications where title like ${lit(`%Leaving ${RUN}%`)}`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
  sql(`delete from public.users where id = ${JEN}`);
}

finish("hand over (users page)");
