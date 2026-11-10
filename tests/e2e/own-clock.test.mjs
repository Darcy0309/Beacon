/**
 * The client's two notes (Nov 2026), in the browser:
 *
 *   A reminder on the person's own clock: a manager in California set one for 4:30 PM at 4:06 PM
 *   and was told the time had passed (it was read on the business's clock, an hour ahead). Here
 *   the browser is put in Honolulu, hours behind the business: a time still ahead there is taken,
 *   kept with its zone, and shown in it.
 *
 *   Notifications: unread ones stand out (a bar, a tint, "New"), a read one can be marked unread
 *   again, from the inbox or once opened, and Clear history takes the read ones out.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `OC-E2E ${Date.now()}`;
const SHOTS = process.env.SHOTS;
const HNL = "Pacific/Honolulu";
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Mountain Valley`)}, ${project}, ${SEAN}) returning id`));
const started = sql("select now()::text");

// The first time in the dialog's list (7:00 AM to 8:45 PM, every 15 minutes) at least 10 minutes ahead in Honolulu.
const hnlNow = sql(`select to_char(now() at time zone '${HNL}', 'HH24:MI')`).split(":").map(Number);
const nowMin = hnlNow[0] * 60 + hnlNow[1];
const slot = Array.from({ length: 56 }, (_, i) => 7 * 60 + i * 15).find((m) => m >= nowMin + 10);
const day = slot === undefined ? "tomorrow" : "today";
const mins = slot ?? 7 * 60;
const label = `${((Math.floor(mins / 60) + 11) % 12) + 1}:${String(mins % 60).padStart(2, "0")} ${mins < 720 ? "AM" : "PM"}`;

const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 15000) => until(() => page.ev(expr), { timeout });

try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.send("Emulation.setTimezoneOverride", { timezoneId: HNL });

  section("A reminder on my own clock");
  await sean.go(`/leads/${lead}`, 5000);
  await sean.mouseClick("[data-set-reminder]");
  await when(sean, "!!document.querySelector('[role=dialog] select[name=\"remind_time\"]')");
  const hint = (await when(sean, "(() => { const t = document.querySelector('[role=dialog]')?.innerText ?? ''; return /Your time \\(/.test(t) ? t : null; })()")) ?? "";
  check("the dialog says the time is mine: Hawaii's", /Your time \(HST\)/.test(hint), hint.slice(0, 300));
  check("…and sends my zone", (await sean.ev("document.querySelector('[role=dialog] [data-own-tz]')?.value")) === HNL);
  await sean.fill('[role=dialog] input[aria-label="Reminder day"]', day);
  await sean.ev("document.activeElement.blur()");
  await sean.fill('[role=dialog] select[name="remind_time"]', label);
  await sean.fill('[role=dialog] textarea[name="note"]', "Call Mike");
  if (SHOTS) await sean.screenshot(`${SHOTS}/reminder-own-clock.png`);
  await sean.click("[role=dialog] button[type=submit]");
  const id = Number(await until(() => sql(`select id from public.reminders where lead_id = ${lead}`) || null, { timeout: 10000 }));
  check(`${day} at ${label} on my clock: taken`, id > 0, await sean.ev("document.querySelector('[role=dialog]')?.innerText ?? ''"));
  const saved = sql(`select to_char(remind_at at time zone '${HNL}', 'FMHH12:MI AM') || '|' || time_zone from public.reminders where id = ${id}`);
  check("…read on my clock, the zone kept", saved === `${label}|${HNL}`, saved);
  const listed = (await when(sean, `document.querySelector('[data-reminder="${id}"]')?.innerText ?? null`)) ?? "";
  check("…listed at my time, the zone named", listed.includes(`${label} HST`) && /Call Mike/.test(listed), listed);

  section("Notifications: unread stands out");
  const note = (title, read) => Number(sql(`insert into public.notifications (user_id, kind, title, body, link, read_at)
    values (${SEAN}, 'system', ${lit(`${TAG} ${title}`)}, 'For the test', '/leads/${lead}', ${read ? "now()" : "null"}) returning id`));
  const unreadOne = note("unread", false);
  const readOne = note("read", true);
  const oldOne = note("old and read", true);
  await sean.go("/notifications", 5000);
  await when(sean, `!!document.querySelector('[data-notification="${readOne}"]')`);
  const look = await sean.ev(`(() => { const s = (id) => { const li = document.querySelector('[data-notification="' + id + '"]'); const c = getComputedStyle(li);
    return { unread: li.hasAttribute('data-unread'), isNew: !!li.querySelector('[data-new]'), bar: c.borderLeftWidth, barColor: c.borderLeftColor, bg: c.backgroundColor }; };
    return { u: s(${unreadOne}), r: s(${readOne}) }; })()`);
  check("unread: a bar down the side, a tint and New", look.u.unread && look.u.isNew && look.u.bar === "4px" && look.u.barColor !== look.r.barColor && look.u.bg !== look.r.bg, JSON.stringify(look));
  check("read: none of them", !look.r.unread && !look.r.isNew, JSON.stringify(look.r));
  if (SHOTS) await sean.screenshot(`${SHOTS}/notifications-unread.png`);

  section("Marked unread again, to keep for later");
  await sean.ev(`document.querySelector('[data-mark-unread="${readOne}"]').click(), true`);
  check("Mark unread: unread again", Boolean(await until(() => sql(`select read_at is null from public.notifications where id = ${readOne}`) === "t" || null, { timeout: 8000 })));
  check("…shown as New", Boolean(await when(sean, `!!document.querySelector('[data-notification="${readOne}"] [data-new]')`)));
  sql(`update public.notifications set read_at = now() where id = ${readOne}`);
  await sean.go(`/notifications/${readOne}`, 5000);
  await when(sean, "!!document.querySelector('[data-keep-unread]')");
  await sean.ev("document.querySelector('[data-keep-unread]').click(), true");
  check("…or once opened: back to the inbox, unread", Boolean(await until(async () => (await sean.path()) === "/notifications" || null, { timeout: 10000 }))
    && Boolean(await until(() => sql(`select read_at is null from public.notifications where id = ${readOne}`) === "t" || null, { timeout: 8000 })));

  section("Clear history");
  await sean.go("/notifications", 5000);
  await when(sean, "!!document.querySelector('[data-clear-history]')");
  await sean.ev("document.querySelector('[data-clear-history]').click(), true");
  const asked = (await when(sean, "document.querySelector('[data-confirm-dialog]')?.innerText")) ?? "";
  check("asks first: the read ones go, unread ones stay", /you've read come out of your inbox/.test(asked) && /Unread ones stay/.test(asked), asked);
  await sean.ev("document.querySelector('[data-confirm-dialog] [data-confirm]').click(), true");
  check("…the read one cleared", Boolean(await until(() => sql(`select cleared_at is not null from public.notifications where id = ${oldOne}`) === "t" || null, { timeout: 8000 })));
  check("…the unread ones kept", sql(`select count(*) from public.notifications where id in (${unreadOne}, ${readOne}) and cleared_at is null`) === "2");
  await sean.go("/notifications", 5000);
  await when(sean, `!!document.querySelector('[data-notification="${unreadOne}"]')`);
  check("…and off the inbox", !(await sean.ev(`!!document.querySelector('[data-notification="${oldOne}"]')`)) && Boolean(await sean.ev(`!!document.querySelector('[data-notification="${readOne}"]')`)));
  if (SHOTS) { await sleep(800); await sean.screenshot(`${SHOTS}/notifications-cleared.png`); }
} finally {
  browser.close();
  // What Clear history took from the seed account, put back.
  sql(`update public.notifications set cleared_at = null where user_id = ${SEAN} and cleared_at >= ${lit(started)}::timestamptz`);
  sql(`delete from public.notifications where title like ${lit(`${TAG}%`)} or link = '/leads/${lead}'`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("own clock and notifications");
