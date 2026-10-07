/**
 * Call-back reminders on the lead sheet, as the client asked: set before
 * moving on, listed above the call results and in the call history, and at
 * the time a notification in the bell that opens the lead. Also, from the
 * same feedback: the decision maker's lines show even when empty (so their
 * Email button is there), and an administrator can correct someone's
 * sign-in email, which is where replies to their emails go.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { sessionCookies } from "../support/auth.mjs";

const RUN = Date.now();
const TAG = `RM-E2E ${RUN}`;
const SHOTS = process.env.SHOTS;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const RACHEL = Number(sql("select id from public.users where email='rachel@beacon.test'"));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, contact_name, phone, email, decision_maker, dm_title, project_id, assigned_user_id)
  values (${lit(`${TAG} Sine Wave`)}, 'Daniel Harpel', '623-695-5500', 'frenchh8er@gmail.test', 'Henry J Park', 'Principal', ${project}, ${SEAN}) returning id`));
const NEW_EMAIL = `rachel.colestock.${RUN}@signaturemktg.test`;

const browser = await launchBrowser({ mouse: true });
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);

try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage();
  await sean.go(`/leads/${lead}`, 4000);

  section("The decision maker's lines, even when empty");
  const dm = await sean.ev(`[...document.querySelectorAll('[data-person="Decision maker"] [data-contact-line]')].map((l) => ({
    kind: l.dataset.contactLine, text: l.innerText.split('\\n').pop(), call: !!l.querySelector('a[href^="tel:"]'), email: !!l.querySelector('[data-email-to]') }))`);
  check("business, mobile and email are listed, “None on file” when empty",
    JSON.stringify(dm.map((l) => [l.kind, l.text])) === JSON.stringify([["Email", "None on file"], ["Business", "None on file"], ["Mobile", "None on file"]]), JSON.stringify(dm));
  check("…with the Email button, to type the address they give", dm[0]?.email && !dm[1]?.call && !dm[2]?.call, JSON.stringify(dm));

  section("Setting a reminder");
  check("Remind me sits above the call results", await sean.ev(`(() => { const r = document.querySelector('[data-reminders]'), b = document.querySelector('button[aria-pressed]');
    return !!r && !!b && (r.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; })()`));
  await sean.mouseClick("[data-set-reminder]");
  await until(() => sean.ev(`!!document.querySelector('[role=dialog] select[name="remind_time"]')`));
  await sean.fill('[role=dialog] input[aria-label="Reminder day"]', "tomorrow");
  await sean.ev("document.activeElement.blur()");
  await sean.fill('[role=dialog] select[name="remind_time"]', "2:00 PM");
  await sean.fill('[role=dialog] textarea[name="note"]', "Ask for Henry");
  await shot(sean, "reminder-form");
  await sean.click("[role=dialog] button[type=submit]");
  check("saving says so", /Reminder set/.test((await sean.waitToast(/Reminder set/, 8000)) ?? ""));
  const id = Number(await until(() => sql(`select id from public.reminders where lead_id = ${lead}`) || null));
  const local = sql(`select to_char(remind_at at time zone public.business_tz(), 'HH24:MI') || ' ' || ((remind_at at time zone public.business_tz())::date - (now() at time zone public.business_tz())::date) from public.reminders where id = ${id}`);
  check("…for 2:00 PM tomorrow on the business's clock", local === "14:00 1", local);
  const listed = await until(() => sean.ev(`document.querySelector('[data-reminder="${id}"]')?.innerText ?? null`));
  check("it is listed above the results, with its note", /2:00 PM/.test(listed ?? "") && /Ask for Henry/.test(listed ?? ""), listed);
  const row = await sean.ev(`document.querySelector('[data-reminder-row]')?.innerText ?? ''`);
  check("…and in the call history", /Call-back reminder/.test(row) && /Sean Fitzgerald/.test(row) && /Ask for Henry/.test(row), row);
  await shot(sean, "reminder-set");

  section("At the time");
  sql(`update public.notifications set read_at = coalesce(read_at, now()) where user_id = ${SEAN}`);
  sql(`update public.reminders set remind_at = now() - interval '1 minute' where id = ${id}`);
  sql("select public.deliver_reminders()");
  const toast = await sean.waitToast(/Call back:/, 10000);
  check("the bell pops up “Call back: …” at once", (toast ?? "").includes(`Call back: ${TAG} Sine Wave`), toast);
  await sean.click('button[aria-label^="Notifications"]');
  await until(() => sean.ev(`!!document.querySelector('[data-notification-panel]')`));
  await sean.click("[data-notification-panel] button", `Call back: ${TAG}`);
  const opened = await until(async () => (await sean.path()).startsWith("/notifications/") && sean.path());
  check("opening it shows the reminder", Boolean(opened) && /Ask for Henry/.test(await sean.text()), opened);
  check("…with a link to the lead", await sean.ev(`!![...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/leads/${lead}')`));
  await sean.go(`/leads/${lead}`, 4000);
  check("the sheet no longer lists it as to come", await sean.ev(`!document.querySelector('[data-reminder="${id}"]')`));

  section("Cancelling one");
  await sean.mouseClick("[data-set-reminder]");
  await until(() => sean.ev(`!!document.querySelector('[role=dialog] select[name="remind_time"]')`));
  await sean.fill('[role=dialog] input[aria-label="Reminder day"]', "tomorrow");
  await sean.ev("document.activeElement.blur()");
  await sean.fill('[role=dialog] select[name="remind_time"]', "3:00 PM");
  await sean.click("[role=dialog] button[type=submit]");
  const second = Number(await until(() => sql(`select id from public.reminders where lead_id = ${lead} and sent_at is null`) || null));
  await until(() => sean.ev(`!!document.querySelector('[data-reminder="${second}"] button')`));
  await sean.click(`[data-reminder="${second}"] button`);
  check("the × cancels it", Boolean(await until(() => sql(`select count(*) from public.reminders where id = ${second}`) === "0")));

  section("Someone not on the name");
  const tyler = await (await browser.newContext({ as: "agent@beacon.test" })).newPage();
  await tyler.go(`/leads/${lead}`, 4000);
  check("no Remind me", await tyler.ev(`!document.querySelector('[data-reminders]')`));

  section("Correcting a sign-in email");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  await admin.go(`/users?q=${encodeURIComponent("Rachel")}`, 4000);
  await admin.pointer('button[aria-label="Actions for Rachel Colestock"]');
  await sleep(300);
  check("an administrator opens Rachel's account", await admin.menuItem("Edit"));
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] input[name="email"]')`));
  await admin.fill('[role=dialog] input[name="email"]', NEW_EMAIL);
  await admin.click("[role=dialog] button[type=submit]");
  check("…changes her email", Boolean(await until(() => sql(`select email from public.users where id = ${RACHEL}`) === NEW_EMAIL, { timeout: 10000 })),
    sql(`select email from public.users where id = ${RACHEL}`));
  check("…and her sign-in moves with it", sql(`select email from auth.users where id = (select auth_id from public.users where id = ${RACHEL})`) === NEW_EMAIL);
  let signsIn = false;
  try { signsIn = (await sessionCookies(NEW_EMAIL)).size > 0; } catch { signsIn = false; }
  check("she signs in with the new one", signsIn);
} finally {
  browser.close();
  // Rachel back as she was: her sign-in, then her directory row.
  sql(`update auth.users set email = 'rachel@beacon.test' where id = (select auth_id from public.users where id = ${RACHEL})`);
  sql(`update public.users set email = 'rachel@beacon.test' where id = ${RACHEL}`);
  sql(`delete from public.activity_log where (entity = 'lead' and entity_id = ${lead}) or (entity = 'user' and entity_id = ${RACHEL} and action = 'user.email')`);
  sql(`delete from public.notifications where kind = 'reminder' and link = '/leads/${lead}'`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("reminders");
