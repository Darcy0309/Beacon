/**
 * A client's Sales Rep and who hears about it (Sean, Oct 2026): chosen on the
 * client's form (between End date and Status), shown on Client Accounts (with
 * its own filter) and on the client's projects; those ticked get the
 * notifications about the client, by email too when asked; with nobody
 * ticked, the Sales Rep does.
 *
 * Needs the app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (any
 * SMTP_USER and SMTP_PASSWORD) and PUSH_DELIVER_SECRET=lighthouse-local-flush-test.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";
import { APP_URL } from "../support/env.mjs";

const SECRET = process.env.TEST_PUSH_SECRET ?? "lighthouse-local-flush-test";
const TAG = `REP-TEST ${Date.now()}`;
const MIKE = Number(sql("select id from public.users where email='mike@beacon.test'"));
const ADMIN = Number(sql("select id from public.users where email='admin@beacon.test'"));
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const company = Number(sql(`insert into public.companies (name, subscription_end) values (${lit(`${TAG} Insurance`)}, current_date + 90) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Churches`)}, ${company}, ${typeId("APPT")}, 1) returning id`));
const lead = (name) => Number(sql(`insert into public.leads (company_name, project_id, stage) values (${lit(`${TAG} ${name}`)}, ${P}, 'appt') returning id`));
const book = (l) => sql(`insert into public.appointments (lead_id, project_id, set_project_id, appt_date, appt_time, qa_status) values (${l}, ${P}, ${P}, current_date + 3, '10:00 AM', 'passed')`);
const toldAbout = (user, name) => Number(sql(`select count(*) from public.notifications where user_id = ${user} and title like ${lit(`%${TAG} ${name}%`)}`));

const mail = await startMailCatcher(2525);
const browser = await launchBrowser();
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("Its Sales Rep, and who hears about it, on the client's form");
  // Its page, at its name (as the app makes the address).
  const link = `/clients/${`${TAG} Insurance`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  await admin.go(link, 6000);
  await when(admin, "!!document.querySelector('[data-edit-client]')");
  await admin.click("[data-edit-client]");
  await when(admin, "!!document.querySelector('[data-client-form] [data-sales-rep]')");
  check("the Sales Rep sits between End date and Status", await admin.ev(`(() => { const labels = [...document.querySelectorAll('[data-client-form] label, [data-client-form] .text-xs')].map((l) => l.textContent.trim());
    const i = labels.findIndex((t) => /^End date/.test(t)), j = labels.findIndex((t) => /^Sales Rep/.test(t)), k = labels.findIndex((t) => /^Status/.test(t)); return i >= 0 && i < j && j < k; })()`));
  check("…an administrator or manager to pick", (await admin.ev(`[...document.querySelectorAll('[data-sales-rep] option')].some((o) => o.value === '${MIKE}')`)) === true);
  await admin.fill("[data-client-form] [data-sales-rep]", String(MIKE));
  await admin.click(`[data-watcher="${ADMIN}"] input[type=checkbox]`);
  await when(admin, `!!document.querySelector('[data-watch-by="${ADMIN}"]')`);
  await admin.fill(`[data-watch-by="${ADMIN}"]`, "email");
  await admin.click("[data-client-form] button[type=submit]", "Save");
  check("saved: Mike owns it; the administrator hears about it, by email too",
    Boolean(await until(() => sql(`select coalesce(sales_rep_id::text, '') from public.companies where id = ${company}`) === String(MIKE) || null, { timeout: 10000 }))
    && sql(`select string_agg(user_id || ':' || by_email, ',') from public.client_watchers where company_id = ${company}`) === `${ADMIN}:true`);
  check("…and it shows on the client's page", Boolean(await when(admin, "/Mike/.test(document.querySelector('[data-client-sales-rep]')?.textContent ?? '')")));

  section("On Client Accounts, and the client's projects");
  await admin.go(`/clients?q=${encodeURIComponent(TAG)}`, 5000);
  check("a Sales Rep column", /Mike/.test((await when(admin, `[...document.querySelectorAll('tr')].find((r) => r.textContent.includes(${JSON.stringify(`${TAG} Insurance`)}))?.querySelector('[data-sales-rep-cell]')?.textContent`)) ?? ""));
  check("…and a Sales Rep filter after Account manager", await admin.ev(`(() => { const t = document.body.innerText; const a = t.indexOf('Account manager'), b = t.indexOf('Sales Rep'); return a >= 0 && b > a; })()`));
  await admin.go(`/projects/${P}`, 5000);
  check("every project of the client shows it", /Sales Rep Mike/.test((await when(admin, "document.querySelector('[data-project-sales-rep]')?.textContent")) ?? ""));

  section("Who is told");
  const L1 = lead("Fusion Air");
  book(L1);
  check("an appointment set: the one ticked hears of it, the Sales Rep (not ticked) does not", toldAbout(ADMIN, "Fusion Air") >= 1 && toldAbout(MIKE, "Fusion Air") === 0);
  check("…and by email, as asked", sql(`select count(*) from public.email_outbox where user_id = ${ADMIN} and kind = 'client_appointment' and subject like ${lit(`%${TAG} Fusion Air%`)}`) === "1");
  await fetch(`${APP_URL}/api/appointments/nudge`, { method: "POST", headers: { "content-type": "application/json", "x-push-secret": SECRET }, body: "{}" });
  check("…sent", Boolean(await until(() => mail.messages.find((m) => m.to.some((t) => t.includes("admin@beacon.test")) && String(m.raw ?? "").replace(/=\r?\n/g, "").includes("Fusion Air")) ?? null, { timeout: 10000 })));
  sql(`delete from public.client_watchers where company_id = ${company}`);
  const L2 = lead("Desert Roofing");
  book(L2);
  check("nobody ticked: the Sales Rep hears of it, as a notification", toldAbout(MIKE, "Desert Roofing") === 1
    && sql(`select count(*) from public.email_outbox where user_id = ${MIKE} and subject like ${lit(`%${TAG}%`)}`) === "0");
} finally {
  browser.close();
  await mail.close?.();
  const like = lit(`%${TAG}%`);
  sql(`delete from public.notifications where title like ${like} or body like ${like}`);
  sql(`delete from public.email_outbox where subject like ${like}`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.client_watchers where company_id = ${company}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("sales rep");
