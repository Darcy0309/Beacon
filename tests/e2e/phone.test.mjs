/**
 * The phone in Lighthouse (Oct 2026), with no button of its own: opened by a phone link (or, here, as one opens it), for the
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
import { APP_URL } from "../support/env.mjs";

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

  section("Opened, with no button of its own");
  check("no phone button floating over the page", await sean.ev(`!document.querySelector('[data-phone-button]')`));
  await sean.ev(`window.dispatchEvent(new CustomEvent('lighthouse:phone'))`);
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
  check("while the call is on, it stays open (there is no button to come back by)", await sean.ev(`!document.querySelector('[data-phone-close]')`));
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

  section("A window to move anywhere");
  // A session of its own: once a call has handed a number to the computer, the test browser's hidden
  // "open the calling app?" prompt keeps simulated mouse and keys from the page (a person answers it).
  const mover = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await mover.go("/work", 5000);
  const box = () => mover.ev(`(() => { const r = document.querySelector('[data-phone-panel]')?.getBoundingClientRect(); return r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), placed: document.querySelector('[data-phone-window]')?.hasAttribute('data-placed') ?? false } : null; })()`);
  // Dragged by any part of the window that is not a button (here, the call's status line), as a person moves it.
  const dragBy = async (dx, dy, from = "[data-phone-status]") => {
    const at = await mover.ev(`(() => { const r = document.querySelector(${JSON.stringify(from)}).getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 }; })()`);
    await mover.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
    await mover.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
    for (let i = 1; i <= 8; i++) await mover.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x + (dx * i) / 8, y: at.y + (dy * i) / 8, button: "left", buttons: 1 });
    await mover.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x + dx, y: at.y + dy, button: "left", clickCount: 1 });
    await sleep(150);
  };
  await mover.ev(`window.dispatchEvent(new CustomEvent('lighthouse:phone'))`);
  const docked = await until(async () => { const b = await box(); return b?.w === 320 ? b : null; });
  check("it opens docked in the corner", docked && !docked.placed, JSON.stringify(docked));
  await dragBy(-500, -300);
  const moved = await box();
  check("dragged by any part of it, not only its title bar, it moves with the mouse", moved?.placed && Math.abs(moved.x - (docked.x - 500)) <= 2 && Math.abs(moved.y - (docked.y - 300)) <= 2, `${JSON.stringify(docked)} → ${JSON.stringify(moved)}`);
  const before = await box();
  await dragBy(-120, -60, '[data-phone-key="5"]');
  const pressed = await box();
  check("…but not from a key: the window stays put", pressed.x === before.x && pressed.y === before.y, JSON.stringify({ before, pressed }));
  await dragBy(-3000, -3000, '[data-phone-bar] .text-sm');
  const corner = await box();
  check("…never off the screen", corner?.x === 8 && corner?.y === 8, JSON.stringify(corner));
  await mover.ev(`document.querySelector('[data-phone-grip]').focus()`);
  await mover.key("ArrowRight");
  await mover.key("ArrowDown");
  check("the arrow keys move it too, from its grip", (await box())?.x === 32 && (await box())?.y === 32, JSON.stringify(await box()));
  await mover.go("/work", 4000);
  await mover.ev(`window.dispatchEvent(new CustomEvent('lighthouse:phone'))`);
  // Measured once its opening animation (a slight scale) has settled.
  const again = await until(async () => { const b = await box(); return b?.w === 320 ? b : null; });
  check("it opens where it was left", again?.placed && again.x === 32 && again.y === 32, JSON.stringify(again ?? await box()));
  await mover.ev(`document.querySelector('[data-phone-bar]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  check("double-clicking its bar puts it back in the corner", Boolean(await until(async () => { const b = await box(); return b && !b.placed && b.x === docked.x && b.y === docked.y; })), JSON.stringify(await box()));
  await dragBy(-200, -100);
  await mover.click("[data-phone-dock-back]");
  check("…as does its corner button", Boolean(await until(async () => { const b = await box(); return b && !b.placed; })));
  check("…and docked there, corner messages move aside again", await mover.ev(`document.documentElement.hasAttribute('data-phone-open')`));

  section("A call coming in: ringing, Answer and Decline");
  // A session of its own, the desktop notifications allowed and nobody looking at the page, as when it rings unseen.
  const ringerContext = await browser.newContext({ as: "sean@beacon.test" });
  const granted = await ringerContext.grant(["notifications"]).then(() => true, () => false);
  const ringer = await ringerContext.newPage({ width: 1400, height: 1000 });
  await ringer.go("/work", 5000);
  await ringer.ev(`document.hasFocus = () => false`);
  const rtext = (sel) => ringer.ev(`document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? null`);
  const shown = () => ringer.ev(`navigator.serviceWorker.getRegistration('/').then((r) => r ? r.getNotifications() : []).then((list) => list.filter((n) => n.data?.kind === 'call').map((n) => ({ title: n.title, body: n.body, id: n.data.id, icon: n.icon, actions: (n.actions ?? []).map((a) => a.title), actionIcons: (n.actions ?? []).map((a) => a.icon) })))`);
  await ringer.ev(`window.dispatchEvent(new CustomEvent('lighthouse:phone'))`);
  await ringer.click("[data-phone-test-call]");
  check("a test call is on its way, with time to look away", Boolean(await ringer.ev(`!!document.querySelector('[data-phone-test-pending]')`)));
  const ringing = await until(() => ringer.ev(`document.querySelector('[data-phone-ringing]')?.dataset.phoneRinging ?? null`), { timeout: 9000 });
  check("it rings: Incoming call, the number, Answer and Decline", ringing === "test" && /Incoming call/.test((await rtext("[data-phone-ringing]")) ?? "")
    && /^\(\d{3}\) \d{3}-\d{4}$/.test((await rtext("[data-phone-caller]")) ?? "") && await ringer.ev(`!!document.querySelector('[data-phone-answer]') && !!document.querySelector('[data-phone-decline]')`), await rtext("[data-phone-ringing]"));
  check("…and while it rings, the window cannot be closed", await ringer.ev(`!document.querySelector('[data-phone-close]')`));
  const notes = granted ? await until(async () => { const n = await shown(); return n.length ? n : null; }, { timeout: 4000 }) : null;
  check("…and on the desktop, with Answer and Decline on it", !granted || (notes?.[0]?.title === "Incoming call (test)" && JSON.stringify(notes[0].actions) === JSON.stringify(["Answer", "Decline"])), JSON.stringify(notes));
  check("…its own phone icon, and one on each button", !granted || (/\/phone\/call-incoming\.png$/.test(notes?.[0]?.icon ?? "")
    && /call-answer\.png$/.test(notes[0].actionIcons[0] ?? "") && /call-decline\.png$/.test(notes[0].actionIcons[1] ?? "")), JSON.stringify(notes?.[0]));
  const icons = await Promise.all(["call-incoming", "call-answer", "call-decline", "call-badge"].map((n) => fetch(`${APP_URL}/phone/${n}.png`).then((r) => r.status === 200 && /image\/png/.test(r.headers.get("content-type") ?? ""))));
  check("…each served as an image", icons.every(Boolean), JSON.stringify(icons));
  // Decline pressed on the desktop notification: the worker passes it to the page, as here.
  await ringer.ev(`navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'lighthouse:call', action: 'decline', id: ${JSON.stringify(notes?.[0]?.id ?? "")} } }))`);
  if (!notes) await ringer.click("[data-phone-decline]");
  check("Decline stops the ringing", Boolean(await until(() => ringer.ev(`!document.querySelector('[data-phone-ringing]')`))));
  check("…takes the desktop notification away", !granted || Boolean(await until(async () => (await shown()).length === 0)));
  await ringer.click('[data-phone-tab="recent"]');
  check("…and is kept under Recent as declined", (await ringer.ev(`document.querySelector('[data-phone-recent-row]')?.dataset.outcome`)) === "declined"
    && (await ringer.ev(`document.querySelector('[data-phone-recent-row]')?.dataset.dir`)) === "in");
  await ringer.click('[data-phone-tab="keypad"]');
  await ringer.click("[data-phone-test-call]");
  await until(() => ringer.ev(`!!document.querySelector('[data-phone-answer]')`), { timeout: 9000 });
  await ringer.click("[data-phone-answer]");
  check("Answer takes the call: timed, as a test", Boolean(await until(async () => /^Test call · 0:0\d$/.test((await rtext("[data-phone-status]")) ?? ""))), await rtext("[data-phone-status]"));
  await sleep(1100);
  await ringer.click("[data-phone-end]");
  await ringer.click('[data-phone-tab="recent"]');
  check("…kept under Recent as a call taken", (await ringer.ev(`document.querySelector('[data-phone-recent-row]')?.dataset.outcome`)) === "talked"
    && (await ringer.ev(`document.querySelector('[data-phone-recent-row]')?.dataset.dir`)) === "in");

  section("A client");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await client.go("/", 5000);
  await client.ev(`window.dispatchEvent(new CustomEvent('lighthouse:phone'))`);
  await sleep(500);
  check("has no phone", await client.ev(`!document.querySelector('[data-phone-window]')`));
} finally {
  browser.close();
  sql(`delete from public.work_activity where lead_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}
finish("phone");
