/**
 * The phone in Lighthouse (Oct 2026): a phone button on every page for the
 * staff, opening a keypad. A number pressed or typed (grouped as it grows)
 * finds its lead; Call hands it to the computer's calling app and times the
 * call; End stops it and keeps it under Recent, to call again; the controls
 * a PanTerra line will bring (mute, hold, tones, record) are there but off,
 * saying so. A lead's Call button opens the phone on its number and lead,
 * calling, and still counts as an account manager's work. Clients have no
 * phone.
 *
 * Removes everything it made.
 *
 *   node tests/run.mjs tests/e2e/phone.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PH ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code='APPT'), 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${SEAN})`);
// A number of its own, so the search finds this lead alone.
const tail = String(Date.now()).slice(-4);
const PHONE = `(480) 555-${tail}`;
const DIGITS = `480555${tail}`;
const lead = Number(sql(`insert into public.leads (company_name, contact_name, phone, project_id, assigned_user_id) values (${lit(`${TAG} Delta Door`)}, 'Dana Reyes', ${lit(PHONE)}, ${APPT}, ${SEAN}) returning id`));
const startedAt = sql("select now()::text");

const browser = await launchBrowser();
try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1400, height: 1000 });
  const text = (sel) => sean.ev(`document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? null`);
  await sean.go("/work", 5000);

  section("The phone button, on every page");
  check("a phone button for the staff", await sean.ev(`!!document.querySelector('[data-phone-button]')`));
  await sean.click("[data-phone-button]");
  check("…opening the phone: keypad and number", Boolean(await until(() => sean.ev(`document.querySelectorAll('[data-phone-key]').length === 12 && !!document.querySelector('[data-phone-number]')`))));
  check("…saying how calls go today", /calling app/i.test((await text("[data-phone-line]")) ?? ""), await text("[data-phone-line]"));
  check("…Call off until there is a number", await sean.ev(`document.querySelector('[data-phone-call]').disabled`));

  section("Dialing");
  for (const k of DIGITS) await sean.click(`[data-phone-key="${k}"]`);
  check("the number grouped as it is pressed", (await sean.ev(`document.querySelector('[data-phone-number]').value`)) === PHONE, await sean.ev(`document.querySelector('[data-phone-number]').value`));
  check("…and the lead it belongs to found", Boolean(await until(async () => (await text("[data-phone-lead]")) === `${TAG} Delta Door`)), await text("[data-phone-lead]"));
  await sean.click("[data-phone-backspace]");
  check("Backspace takes the last digit off", (await sean.ev(`document.querySelector('[data-phone-number]').value`)) === PHONE.slice(0, -1));
  await sean.click(`[data-phone-key="${DIGITS.at(-1)}"]`);

  section("A call");
  await sean.ev(`window.__dialed = []; new MutationObserver((m) => m.forEach((r) => r.addedNodes.forEach((n) => n.dataset?.phoneDial && window.__dialed.push(n.dataset.phoneDial)))).observe(document.body, { childList: true })`);
  await sean.click("[data-phone-call]");
  check("Call hands the number to the computer's calling app", Boolean(await until(() => sean.ev(`window.__dialed.includes('tel:+1${DIGITS}')`))), JSON.stringify(await sean.ev("window.__dialed")));
  check("…and the page stays where it is", (await sean.path()) === "/work");
  check("the call is timed", Boolean(await until(async () => /In your calling app · 0:0[1-9]/.test((await text("[data-phone-status]")) ?? ""), { timeout: 4000 })), await text("[data-phone-status]"));
  const controls = await sean.ev(`[...document.querySelectorAll('[data-phone-control]')].map((b) => b.dataset.phoneControl + ':' + b.disabled)`);
  check("mute, hold, keypad tones and record are there, off until PanTerra connects, and say so",
    JSON.stringify(controls) === JSON.stringify(["mute:true", "hold:true", "tones:true", "record:true"]) && /PanTerra connection/.test((await text("[data-phone-line-note]")) ?? ""), JSON.stringify(controls));
  await sean.click("[data-phone-close]");
  check("minimized, the button shows the call's time", /^\d+:\d\d$/.test((await text("[data-phone-timer]")) ?? ""), await text("[data-phone-timer]"));
  await sean.click("[data-phone-button]");
  await sleep(1100);
  await sean.click("[data-phone-end]");
  check("End stops it", /^Call ended · 0:0\d$/.test((await until(async () => { const t = await text("[data-phone-status]"); return /ended/.test(t ?? "") ? t : null; })) ?? ""));
  check("…with a way to record its result on the lead", (await sean.ev(`document.querySelector('[data-phone-result]')?.getAttribute('href')`)) === `/leads/${lead}`);

  section("Messages beside it, not over it");
  // A message in the corner (the desktop-notifications prompt shows on signing in) sits left of the open phone.
  const sideBySide = await until(() => sean.ev(`(() => {
    const t = document.querySelector('[data-sonner-toaster] [data-sonner-toast]');
    const p = document.querySelector('[data-phone-panel]');
    if (!t || !p) return null;
    return { message: Math.round(t.getBoundingClientRect().right), phone: Math.round(p.getBoundingClientRect().left) };
  })()`), { timeout: 4000 });
  check("a corner message shows to the left of the open phone, not over its buttons",
    sideBySide ? sideBySide.message <= sideBySide.phone : await sean.ev(`document.documentElement.hasAttribute('data-phone-open')`), JSON.stringify(sideBySide));

  section("Recent calls");
  await sean.click('[data-phone-tab="recent"]');
  const recent = await until(() => sean.ev(`[...document.querySelectorAll('[data-phone-recent-row]')].map((r) => r.innerText.replace(/\\s+/g, ' '))`).then((r) => (r.length ? r : null)));
  check("the call is under Recent: the lead, number, when and how long", (recent?.[0] ?? "").includes(`${TAG} Delta Door`) && (recent?.[0] ?? "").includes(PHONE), JSON.stringify(recent));
  await sean.ev(`window.__dialed = []`);
  await sean.click(`[data-phone-recent-row] button[aria-label^="Call"]`);
  check("…and called again from there", Boolean(await until(() => sean.ev(`window.__dialed.includes('tel:+1${DIGITS}')`))));
  await sean.click("[data-phone-end]");

  section("A lead's Call button");
  await sean.go(`/leads/${lead}`, 5000);
  await sean.ev(`window.__dialed = []; new MutationObserver((m) => m.forEach((r) => r.addedNodes.forEach((n) => n.dataset?.phoneDial && window.__dialed.push(n.dataset.phoneDial)))).observe(document.body, { childList: true })`);
  await sean.click('[data-prospect-info] [data-contact-line="Business phone"] a[href^="tel:"]');
  check("opens the phone on its number, calling", Boolean(await until(() => sean.ev(`window.__dialed.includes('tel:+1${DIGITS}') && document.querySelector('[data-phone-status]')?.dataset.phoneStatus === 'active'`))));
  check("…with the lead named", Boolean(await until(async () => (await text("[data-phone-lead]")) === `${TAG} Delta Door`)), await text("[data-phone-lead]"));
  check("…still counted as work for the account manager", Boolean(await until(() => sql(`select count(*) from public.work_activity where user_id = ${SEAN} and kind = 'call' and lead_id = ${lead} and at >= ${lit(startedAt)}`) !== "0", { timeout: 6000 })));
  await sean.click("[data-phone-end]");

  section("A client");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await client.go("/", 5000);
  check("has no phone", await client.ev(`!document.querySelector('[data-phone-button]')`));
} finally {
  browser.close();
  sql(`delete from public.work_activity where lead_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}
finish("phone");
