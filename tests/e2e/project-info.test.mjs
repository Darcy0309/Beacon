/**
 * Project Info (Sean, Oct 2026), end to end: an administrator fills in a
 * project's Project Info (a DB dev project shares its appointment
 * project's); a manager reads it on the Project Info tab of a lead sheet,
 * with the agent's area code for the caller ID and the office's address
 * opening directions to the lead's city, and cannot change it; the days to
 * avoid block those weekdays out on the project's calendar; the client is
 * emailed a private link, fills it in without signing in, and an earlier
 * link stops working once a new one is made; each lead goes to the
 * producers ticked for leads as well as the project's delivery address; and
 * the client keeps it up to date from their own sign-in.
 *
 * Needs the app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (any
 * SMTP_USER and SMTP_PASSWORD), as the delivery test does.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";
import { APP_URL } from "../support/env.mjs";

const SHOTS = process.env.SHOTS;
const RUN = Date.now();
const TAG = `PI-TEST ${RUN}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const CLIENT = userId("client@beacon.test");
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT}`);
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const mailSetting = sql("select value::text from public.app_settings where key = 'mail'");
sql(`update public.app_settings set value = value || '{"from": "alerts@signaturemktg.net"}'::jsonb where key = 'mail'`);

const AGENT_EMAIL = `jhuray.${RUN}@ruralins.test`;
const JOSH = `josh.${RUN}@ruralins.test`;
const AMY = `amy.${RUN}@ruralins.test`;
const LEADS = `leads.${RUN}@ruralins.test`;
const CARRIERS = ["Rural Mutual", "Pekin", "Secura"].map((c) => `${TAG} ${c}`);
const agencyIds = CARRIERS.map((name) => Number(sql(`insert into public.agencies (name) values (${lit(name)}) returning id`)));
const company = Number(sql(`insert into public.companies (name, email) values (${lit(`${TAG} Rural Insurance`)}, ${lit(`office.${RUN}@ruralins.test`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, contact_name, phone, address, city, state, zip)
  values (${lit(`${TAG} Appts`)}, ${company}, ${typeId("APPT")}, 1, 'Josh Huray', '(715) 934-2400', '15561 Railroad St', 'Hayward', 'WI', '54843') returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, email)
  values (${lit(`${TAG} DBDev`)}, ${company}, ${typeId("DBDV")}, 1, ${APPT}, ${lit(LEADS)}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN})`);
const LEAD = Number(sql(`insert into public.leads (company_name, contact_name, phone, city, state, zip, project_id, assigned_user_id)
  values (${lit(`${TAG} Eau Claire Plumbing`)}, 'Pat Olson', '715-555-0199', 'Eau Claire', 'WI', '54701', ${DBDV}, ${SEAN}) returning id`));
sql(`update public.users set company_id=${company} where id=${CLIENT}`);

const profile = () => JSON.parse(sql(`select coalesce(row_to_json(t)::text, 'null') from (select * from public.project_profiles where project_id = ${APPT}) t`) || "null");
const mail = await startMailCatcher(2525);
const browser = await launchBrowser();
const sent = (to) => mail.messages.filter((m) => m.to.includes(to));
const plain = (m) => m.raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const DENIED = /don.t have access to this page/i;
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);

/** Navigate and wait until the page has finished loading. */
async function open(page, href) {
  await page.go(href, 300);
  await until(() => page.ev(`document.readyState === 'complete' && !document.querySelector('[aria-busy="true"]') && document.body.innerText.length > 100`), { timeout: 15000 });
  await sleep(300);
  return page.text();
}
const inDialog = (page, selector) => until(() => page.ev(`!!document.querySelector('[data-dialog-content] ${selector}')`), { timeout: 8000 });
/** Choose an option from a pick list's drop-down (it adds a chip to the box). */
const pick = (page, list, value) => page.fill(`[data-pick-list="${list}"] select`, value);
const chips = (page, list) => page.ev(`[...document.querySelectorAll('[data-pick-list="${list}"] [data-picked]')].map((c) => c.dataset.picked)`);

let firstLink = null;
let newLink = null;

try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage();
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage();

  section("An administrator fills in the Project Info");
  let t = await open(admin, `/projects/${APPT}`);
  check("the project page has a Project Info card, with the office on file", await admin.ev(`!!document.querySelector('[data-project-info-card]')`) && t.includes("Josh Huray") && t.includes("15561 Railroad St"));
  check("…the agent's area code, for the caller ID", await admin.ev(`!!document.querySelector('[data-project-info-card] [data-area-code="715"]')`));
  await admin.click("[data-project-info-card] [data-edit-project-info]");
  check("Edit opens the form", Boolean(await inDialog(admin, "[data-project-info-form]")));
  await admin.fill('[data-dialog-content] input[name="agent_mobile"]', "715-555-0101");
  await admin.fill('[data-dialog-content] input[name="agent_email"]', AGENT_EMAIL);
  // The check list: all at once, then take some off (clients licensed in 20+ states, or all).
  const states = '[data-dialog-content] [data-pick-list="states_licensed"]';
  await admin.click(`${states} [data-pick-open]`);
  await admin.click(`${states} [data-pick-all]`);
  check("Check list › Select all: every state", (await chips(admin, "states_licensed")).length === 51, String((await chips(admin, "states_licensed")).length));
  await admin.click(`${states} [data-pick-option="TX"] input`);
  check("…untick one to take it off", (await chips(admin, "states_licensed")).length === 50 && !(await chips(admin, "states_licensed")).includes("TX"));
  await admin.click(`${states} [data-pick-clear]`);
  await admin.fill(`${states} [data-pick-find]`, "w");
  await admin.click(`${states} [data-pick-all]`);
  check("…find, then Select all picks only those shown", JSON.stringify(await chips(admin, "states_licensed")) === '["WA","WI","WV","WY"]', JSON.stringify(await chips(admin, "states_licensed")));
  await admin.click(`${states} [data-pick-clear]`);
  await admin.ev(`[...document.querySelectorAll('${states} [data-pick-panel] button')].find((b) => b.textContent.trim() === "Done").click()`);
  check("…Clear takes them off, Done closes it", (await chips(admin, "states_licensed")).length === 0
    && Boolean(await until(() => admin.ev(`!document.querySelector('${states} [data-pick-panel]')`))));
  await pick(admin, "states_licensed", "WI");
  await pick(admin, "states_licensed", "MN");
  check("states are picked into the box, A to Z", JSON.stringify(await chips(admin, "states_licensed")) === '["MN","WI"]', JSON.stringify(await chips(admin, "states_licensed")));
  await admin.fill('[data-dialog-content] input[name="producer_first_1"]', "Josh");
  await admin.fill('[data-dialog-content] input[name="producer_last_1"]', "Huray");
  await admin.fill('[data-dialog-content] input[name="producer_email_1"]', JOSH);
  await admin.click('[data-dialog-content] [data-producer="1"] input[type="checkbox"]');
  await admin.fill('[data-dialog-content] input[name="producer_first_2"]', "Amy");
  await admin.fill('[data-dialog-content] input[name="producer_last_2"]', "Lee");
  await admin.fill('[data-dialog-content] input[name="producer_email_2"]', AMY);
  // The project's own delivery address, ticked too: it is still sent one copy.
  await admin.fill('[data-dialog-content] input[name="producer_email_3"]', LEADS);
  await admin.click('[data-dialog-content] [data-producer="3"] input[type="checkbox"]');
  await pick(admin, "top_carriers", CARRIERS[0]);
  await pick(admin, "top_carriers", CARRIERS[1]);
  await pick(admin, "avoid_carriers", CARRIERS[2]);
  check("carriers fill their boxes in the order picked", JSON.stringify(await chips(admin, "top_carriers")) === JSON.stringify(CARRIERS.slice(0, 2)));
  await admin.click("[data-dialog-content] [data-avoid-days] label", "Mon");
  await admin.click("[data-dialog-content] [data-avoid-days] label", "Fri");
  await admin.fill('[data-dialog-content] select[name="personal_lines"]', "yes");
  await admin.fill('[data-dialog-content] select[name="min_employees"]', "5");
  await admin.fill('[data-dialog-content] select[name="quote_time"]', "2-3 months");
  await admin.fill('[data-dialog-content] select[name="quote_min_time"]', "3-4 weeks");
  check("a mono-line count waits for a yes", await admin.ev(`document.querySelector('[data-dialog-content] input[name="wc_min_employees"]').disabled`));
  await admin.fill('[data-dialog-content] select[name="wc_mono"]', "yes");
  await until(() => admin.ev(`!document.querySelector('[data-dialog-content] input[name="wc_min_employees"]').disabled`));
  await admin.fill('[data-dialog-content] input[name="wc_min_employees"]', "10");
  await admin.fill('[data-dialog-content] select[name="auto_mono"]', "no");
  await admin.fill('[data-dialog-content] select[name="health_only"]', "yes");
  await until(() => admin.ev(`!document.querySelector('[data-dialog-content] input[name="health_min_lives"]').disabled`));
  await admin.fill('[data-dialog-content] input[name="health_min_lives"]', "25");
  await admin.fill('[data-dialog-content] textarea[name="special_programs"]', "Work comp dividend program for low claims. 30 years in business.");
  await shot(admin, "project-info-form");
  check("the dialog itself never scrolls: its title and buttons stay put", await admin.ev(`(() => { const d = document.querySelector('[data-dialog-content]'); return d.scrollTop === 0 && d.scrollHeight <= d.clientHeight + 1; })()`),
    await admin.ev(`(() => { const d = document.querySelector('[data-dialog-content]'); return [d.scrollTop, d.scrollHeight, d.clientHeight].join(" / "); })()`));
  check("one scroll bar in the dialog", await admin.ev(`[...document.querySelectorAll('[data-dialog-content], [data-dialog-content] *')].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && !['absolute', 'fixed'].includes(s.position) && e.scrollHeight > e.clientHeight; }).length === 1`));
  await admin.click("[data-dialog-content] [data-save-project-info]");
  check("saved", /Project Info saved/.test(await admin.waitToast(/Project Info saved/, 10000)), await admin.toasts());
  let row = profile();
  check("kept: the states, the days to avoid, the carriers", JSON.stringify([row?.states_licensed, row?.avoid_days, row?.top_carriers, row?.avoid_carriers])
    === JSON.stringify([["MN", "WI"], [1, 5], CARRIERS.slice(0, 2), [CARRIERS[2]]]), JSON.stringify(row));
  check("…the producers, and which get leads by email", JSON.stringify((row?.producers ?? []).map((p) => [p.first, p.last, p.email, p.leads])) === JSON.stringify([
    ["Josh", "Huray", JOSH, true], ["Amy", "Lee", AMY, false], ["", "", LEADS, true],
  ]), JSON.stringify(row?.producers));
  check("…the answers", row?.personal_lines === true && row?.min_employees === 5 && row?.quote_time === "2-3 months" && row?.quote_min_time === "3-4 weeks"
    && row?.wc_mono === true && row?.wc_min_employees === 10 && row?.auto_mono === false && row?.auto_min_autos === null && row?.health_min_lives === 25
    && row?.agent_email === AGENT_EMAIL && row?.updated_via === "app", JSON.stringify(row));
  t = await open(admin, `/projects/${APPT}`);
  await admin.ev(`document.querySelector('[data-project-info-card]').scrollIntoView({ block: 'start' })`);
  await shot(admin, "project-info-card");
  check("the card reads it back", t.includes("Mondays & Fridays") && t.includes("Yes · 10+ employees") && t.includes(`${CARRIERS[0]}, ${CARRIERS[1]}`) && /Updated .* by /.test(t));
  t = await open(admin, `/projects/${DBDV}`);
  check("the DB dev project shows its appointment project's", t.includes(`Shared with ${TAG} Appts, the appointment project this one is tied to.`) && t.includes("Mondays & Fridays"));

  section("A tied project that needs to differ keeps its own");
  const own = () => JSON.parse(sql(`select coalesce(row_to_json(t)::text, 'null') from (select own, avoid_days, top_carriers from public.project_profiles where project_id = ${DBDV}) t`) || "null");
  await admin.click('[data-own-info="shared"]');
  check("Keep its own: a copy of the shared one to start from", Boolean(await until(() => own()?.own === true))
    && JSON.stringify(own()?.avoid_days) === "[1,5]" && JSON.stringify(own()?.top_carriers) === JSON.stringify(CARRIERS.slice(0, 2)), JSON.stringify(own()));
  sql(`update public.project_profiles set avoid_days = '{3}' where project_id = ${DBDV}`);
  t = await open(admin, `/projects/${DBDV}`);
  check("…it shows its own, apart from the appointment project's", t.includes(`This project's own, apart from ${TAG} Appts's.`) && t.includes("Wednesdays") && !t.includes("Mondays & Fridays"));
  check("…and the appointment project's is untouched", JSON.stringify(profile()?.avoid_days) === "[1,5]");
  const ownDays = await admin.ev(`fetch('/api/project-calendar?project=${DBDV}&from=2026-11-01&to=2026-11-30').then((r) => r.json()).then((c) => c.blocks.find((b) => b.weekly)?.weekdays)`);
  const apptDays = await admin.ev(`fetch('/api/project-calendar?project=${APPT}&from=2026-11-01&to=2026-11-30').then((r) => r.json()).then((c) => c.blocks.find((b) => b.weekly)?.weekdays)`);
  check("…its calendar blocks its own days to avoid, the appointment project's its own", JSON.stringify([ownDays, apptDays]) === "[[3],[1,5]]", JSON.stringify([ownDays, apptDays]));
  await admin.ev(`document.querySelector('[data-project-info-card]').scrollIntoView({ block: 'start' })`);
  await shot(admin, "project-info-own");
  await admin.click('[data-own-info="own"]');
  check("Use the shared one: back on the appointment project's", Boolean(await until(() => own()?.own === false)));
  t = await open(admin, `/projects/${DBDV}`);
  check("…shown again", t.includes(`Shared with ${TAG} Appts`) && t.includes("Mondays & Fridays"));

  section("A manager reads it on the lead sheet");
  t = await open(sean, `/leads/${LEAD}?tab=info`);
  check("the Project Info tab sits to the right of Notes", JSON.stringify(await sean.ev(`[...document.querySelectorAll('[role=tablist]')[0].querySelectorAll('[role=tab]')].map((b) => b.dataset.tab).slice(-2)`)) === '["notes","info"]');
  check("…opened with ?tab=info, showing the shared Project Info", await sean.ev(`!document.querySelector('[data-tab-panel="info"]').hidden`) && t.includes("Mondays & Fridays"));
  await sean.ev(`document.querySelector('[role=tablist]').scrollIntoView({ block: 'start' })`);
  await shot(sean, "project-info-lead-tab");
  check("a manager can't change it", await sean.ev(`!document.querySelector('[data-tab-panel="info"] [data-edit-project-info]')`));
  const href = await sean.ev(`document.querySelector('[data-tab-panel="info"] [data-agent-address]')?.href`);
  const maps = href ? new URL(href) : null;
  check("the agent's address opens Google Maps directions to the lead's city, in a new tab",
    maps?.hostname === "www.google.com" && maps.pathname === "/maps/dir/" && maps.searchParams.get("origin") === "15561 Railroad St, Hayward, WI 54843"
    && maps.searchParams.get("destination") === "Eau Claire, WI 54701" && maps.searchParams.get("travelmode") === "driving"
    && (await sean.ev(`document.querySelector('[data-tab-panel="info"] [data-agent-address]').target`)) === "_blank", href);
  check("…and says what it shows", t.includes("Miles and drive time to Eau Claire, WI 54701"));
  check("the caller ID area code", Boolean(await sean.ev(`!!document.querySelector('[data-tab-panel="info"] [data-area-code="715"]')`)));
  check("the producers who get leads are marked", (await sean.ev(`document.querySelectorAll('[data-tab-panel="info"] [data-gets-leads]').length`)) === 2);

  section("The days to avoid, on the calendar");
  const calendar = await sean.ev(`fetch('/api/project-calendar?project=${DBDV}&from=2026-11-01&to=2026-11-30').then((r) => r.json())`);
  const weekly = calendar?.blocks?.find((b) => b.weekly);
  check("the project's calendar has them as a block kept every week", JSON.stringify(weekly?.weekdays) === "[1,5]" && weekly?.id === `w${APPT}`, JSON.stringify(calendar?.blocks));
  const monday = await sean.ev(`[...document.querySelectorAll('[data-project-calendar] button[data-day]')].map((b) => b.dataset.day).find((d) => new Date(d + 'T12:00:00Z').getUTCDay() === 1)`);
  const tuesday = await sean.ev(`[...document.querySelectorAll('[data-project-calendar] button[data-day]')].map((b) => b.dataset.day).find((d) => new Date(d + 'T12:00:00Z').getUTCDay() === 2)`);
  check("the lead sheet's calendar shades every Monday, not Tuesdays",
    (await sean.ev(`document.querySelector('[data-project-calendar] button[data-day="${monday}"]')?.dataset.blocked`)) === "day"
    && !(await sean.ev(`document.querySelector('[data-project-calendar] button[data-day="${tuesday}"]')?.dataset.blocked`)), `${monday} / ${tuesday}`);
  await sean.click(`[data-project-calendar] button[data-day="${monday}"]`);
  await until(() => sean.ev(`!!document.querySelector('[data-project-calendar] [data-weekly]')`));
  check("…a Monday lists it, with no way to take it off there", await sean.ev(`!!document.querySelector('[data-project-calendar] [data-weekly]') && !document.querySelector('[data-project-calendar] [data-weekly] [data-remove-block]')`));
  t = await open(admin, `/calendar?project=${APPT}`);
  check("the Calendar page's blocked time lists it every week, not to be taken off there",
    await admin.ev(`!!document.querySelector('[data-blocked-time] [data-block="w${APPT}"]') && !document.querySelector('[data-blocked-time] [data-block="w${APPT}"] [data-remove-block]')`)
    && t.includes("Every Mon & Fri"));

  section("The client is sent a private link");
  await open(admin, `/projects/${APPT}`);
  await admin.click("[data-send-project-info]");
  await inDialog(admin, "[data-info-link-dialog]");
  firstLink = await until(async () => { const v = await admin.ev(`document.querySelector('[data-info-link]')?.value`); return /^https?:\/\//.test(v ?? "") ? v : null; }, { timeout: 8000 });
  check("the dialog makes the link", /\/client-profile\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(firstLink ?? ""), firstLink);
  await shot(admin, "project-info-link-dialog");
  check("…to the agent's email by default", (await admin.ev(`document.querySelector('[data-info-link-dialog] input[name="to"]').value`)) === AGENT_EMAIL);
  check("…saying Hi to the agent by name", (await admin.ev(`document.querySelector('[data-info-link-dialog] input[name="name"]').value`)) === "Josh Huray");
  await admin.fill('[data-info-link-dialog] input[name="name"]', "Josh");
  await admin.click("[data-send-info-link]");
  check("sent", /Project Info link sent/.test(await admin.waitToast(/Project Info link sent/, 15000)), await admin.toasts());
  const email = await until(() => sent(AGENT_EMAIL)[0], { timeout: 15000 });
  const body = email ? plain(email) : "";
  // Its own link: made as it is sent, good for 30 days from then (the dialog's is another, as good).
  const emailed = body.match(/https?:\/\/[^\s"<>]+\/client-profile\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0] ?? null;
  check("the email asks them to fill it in, with their link", email?.headers.subject === `Your Project Info for ${TAG} Appts` && Boolean(emailed)
    && body.includes("Fill in your Project Info") && body.includes("15561 Railroad St, Hayward, WI 54843"), `${email?.headers.subject} ${emailed}`);
  const sender = sql("select trim(concat_ws(' ', first_name, last_name)) from public.users where email = 'admin@beacon.test'");
  check("…Hi to the name given, from the sender by name, never their email", body.includes("Hi Josh,") && body.includes(sender ? `${sender} at Signature Marketing has set up` : "\nSignature Marketing has set up") && !body.includes("admin@beacon.test at"),
    body.match(/Hi[^\n<]*/)?.[0]);
  firstLink = emailed ?? firstLink;
  // Replies go to the administrator who sent it, when theirs is an address mail can reach (the seeded one's is not).
  check("…from the company's address", /alerts@signaturemktg\.net/.test(email?.headers.from ?? "") && !email?.headers["reply-to"], `${email?.headers.from} / ${email?.headers["reply-to"]}`);
  check("logged", Number(sql(`select count(*) from public.activity_log where action='project.info_link' and entity_id=${APPT}`)) === 1);

  section("The client fills it in from the link, without signing in");
  const visitor = await (await browser.newContext()).newPage();
  const raw = await fetch(firstLink);
  const html = await raw.text();
  check("the link opens without signing in, never indexed", raw.status === 200 && /<meta name="robots" content="noindex, nofollow"/.test(html) && /<meta name="referrer" content="no-referrer"/.test(html), `${raw.status}`);
  t = await open(visitor, firstLink);
  await shot(visitor, "project-info-link-page");
  check("the page names the client and project, the form filled in so far", t.includes(`${TAG} Rural Insurance · ${TAG} Appts`)
    && (await visitor.ev(`document.querySelector('input[name="contact_name"]').value`)) === "Josh Huray"
    && JSON.stringify(await chips(visitor, "states_licensed")) === '["MN","WI"]');
  await visitor.fill('textarea[name="special_programs"]', "Work comp dividend program for low claims. 31 years in business.");
  await visitor.click("[data-avoid-days] label", "Fri");
  await visitor.click('[data-producer="2"] input[type="checkbox"]');
  await visitor.fill('input[name="producer_email_4"]', "not-an-email");
  await visitor.click("[data-save-project-info]");
  await until(() => visitor.ev(`!!document.querySelector('[role=alert]')`), { timeout: 10000 });
  check("a bad address is caught, the rest kept", (await visitor.text()).includes("Enter one email address")
    && JSON.stringify(await chips(visitor, "states_licensed")) === '["MN","WI"]' && (await visitor.ev(`document.querySelector('textarea[name="special_programs"]').value`)).includes("31 years"));
  await visitor.fill('input[name="producer_email_4"]', "");
  await visitor.click("[data-save-project-info]");
  check("saved from the link", Boolean(await until(() => visitor.ev(`!!document.querySelector('[data-info-saved]')`), { timeout: 10000 })));
  row = profile();
  check("…straight to the project, as the client's", row?.updated_via === "link" && row?.updated_by === null && JSON.stringify(row?.avoid_days) === "[1]"
    && row?.special_programs.includes("31 years") && row?.producers?.[1]?.leads === true, JSON.stringify(row));
  t = await open(admin, `/projects/${APPT}`);
  check("the project page says the client updated it from their link", t.includes("by the client, from their link") && t.includes("Mondays") && !t.includes("Mondays & Fridays"));
  const forged = firstLink.replace(/\.([A-Za-z0-9_-]+)$/, (_, mac) => `.${mac.slice(0, -2)}${mac.endsWith("AA") ? "BB" : "AA"}`);
  t = await open(visitor, forged);
  check("an altered link opens nothing", Boolean(await visitor.ev(`!!document.querySelector('[data-info-link-problem]')`)) && !(await visitor.ev(`!!document.querySelector('[data-project-info-form]')`)));

  section("Stop earlier links");
  await open(admin, `/projects/${APPT}`);
  await admin.click("[data-send-project-info]");
  await inDialog(admin, "[data-info-link-dialog]");
  const shown = await until(async () => { const v = await admin.ev(`document.querySelector('[data-info-link]')?.value`); return /^https?:/.test(v ?? "") ? v : null; }, { timeout: 8000 });
  await admin.click("[data-reset-info-link]");
  await until(() => admin.ev(`!!document.querySelector('[data-confirm-dialog] [data-confirm]')`));
  await admin.click("[data-confirm-dialog] [data-confirm]");
  check("a new link is made", /new link is ready/.test(await admin.waitToast(/new link is ready/, 10000)), await admin.toasts());
  newLink = await until(async () => { const v = await admin.ev(`document.querySelector('[data-info-link]')?.value`); return v && v !== shown ? v : null; }, { timeout: 8000 });
  check("…in the dialog", Boolean(newLink) && newLink !== firstLink);
  check("logged", Number(sql(`select count(*) from public.activity_log where action='project.info_link_reset' and entity_id=${APPT}`)) === 1);
  t = await open(visitor, firstLink);
  check("the link emailed before no longer opens", /replaced by a newer one/.test(t) && !(await visitor.ev(`!!document.querySelector('[data-project-info-form]')`)));
  t = await open(visitor, shown);
  check("…nor one copied before", /replaced by a newer one/.test(t));
  t = await open(visitor, newLink);
  check("…the new one does", Boolean(await visitor.ev(`!!document.querySelector('[data-project-info-form]')`)));
  const phone = await (await browser.newContext()).newPage({ width: 390, height: 800 });
  await open(phone, newLink);
  await shot(phone, "project-info-link-phone");
  check("on a phone: nothing runs off the side, and Save stays in reach", await phone.ev(`document.documentElement.scrollWidth <= innerWidth
    && (() => { const r = document.querySelector('[data-save-project-info]').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })()`),
    await phone.ev(`[document.documentElement.scrollWidth, innerWidth].join(" / ")`));

  section("Leads go to the producers ticked for them");
  const before = mail.messages.length;
  await open(admin, `/leads/${LEAD}`);
  await admin.click('[role=tab][data-tab="deliveries"]');
  await sleep(300);
  await admin.click("[data-resend-delivery]");
  await until(() => mail.messages.length - before >= 3, { timeout: 20000 });
  await sleep(1500);
  const to = mail.messages.slice(before).flatMap((m) => m.to).sort();
  check("the project's delivery address once, and each producer ticked for leads", JSON.stringify(to) === JSON.stringify([AMY, JOSH, LEADS].sort()), JSON.stringify(to));
  const kept = JSON.parse(sql(`select coalesce(json_agg(to_address order by to_address), '[]') from public.lead_deliveries where lead_id=${LEAD}`));
  check("…each send kept on the lead", JSON.stringify(kept) === JSON.stringify([AMY, JOSH, LEADS].sort()), JSON.stringify(kept));

  section("The client keeps it up to date from their own sign-in");
  t = await open(client, "/project-info");
  check("the sidebar has Project Info for a client", await client.ev(`!!document.querySelector('aside nav a[href="/project-info"]')`));
  check("one Project Info for the pair of projects", (await client.ev(`document.querySelectorAll('[data-info-project]').length`)) === 1
    && (await client.ev(`!!document.querySelector('[data-info-project="${APPT}"]')`)) && t.includes(`Also used by ${TAG} DBDev.`));
  await client.click(`[data-info-project="${APPT}"] [data-edit-project-info]`);
  await inDialog(client, "[data-project-info-form]");
  await client.fill('[data-dialog-content] input[name="agent_mobile"]', "715-555-0177");
  await client.click("[data-dialog-content] [data-save-project-info]");
  check("saved", /Project Info saved/.test(await client.waitToast(/Project Info saved/, 10000)), await client.toasts());
  row = profile();
  check("…as the client", row?.agent_mobile === "715-555-0177" && row?.updated_by === CLIENT && row?.updated_via === "app", JSON.stringify(row));
  t = await open(sean, "/project-info");
  check("a manager has no Project Info page of their own", DENIED.test(t));
  await open(client, "/project-info");
  await shot(client, "project-info-client-page");
} finally {
  browser.close();
  await mail.close();
  const like = lit(`${TAG}%`);
  sql(`update public.users set company_id=${clientCompany} where id=${CLIENT}`);
  sql(`update public.app_settings set value = ${lit(mailSetting)}::jsonb where key = 'mail'`);
  sql(`delete from public.lead_deliveries where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.activity_log where (entity='lead' and entity_id in (select id from public.leads where company_name like ${like})) or (entity='project' and entity_id in (${DBDV}, ${APPT}))`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT})`);
  sql(`update public.projects set appt_project_id = null where id = ${DBDV}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
  sql(`delete from public.agencies where id in (${agencyIds.join(",")})`);
}

finish("Project Info");
