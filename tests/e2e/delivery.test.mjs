/**
 * Lead delivery, end to end, with the test's mail catcher standing in for
 * the mail service: a call that makes a name a Lead emails its sheet to the
 * project's delivery addresses (a link to it for one marked "_"), the link
 * opens the sheet without signing in (and a tampered one does not), the
 * lead sheet lists each send, "Send to client again" sends it again, a
 * refused address is kept as not sent with the reason, and a result that
 * is not a lead or an appointment sends nothing.
 *
 * Needs the app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (any
 * SMTP_USER and SMTP_PASSWORD), as the email test does.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";
import { APP_URL } from "../support/env.mjs";

const RUN = Date.now();
const TAG = `DL-TEST ${RUN}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const SHEET_TO = `leads.${RUN}@capital.test`;
const LINK_TO = `jacob.${RUN}@capital.test`;
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const mailSetting = sql("select value::text from public.app_settings where key = 'mail'");
sql(`update public.app_settings set value = value || '{"from": "alerts@signaturemktg.net"}'::jsonb where key = 'mail'`);

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appointments`)}, ${company}, ${typeId("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, email, contact_name)
  values (${lit(`${TAG} Churches`)}, ${company}, ${typeId("DBDV")}, 1, ${APPT}, ${lit(`${SHEET_TO}, _${LINK_TO}`)}, 'Jacob Termini') returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN})`);
const newName = (name) => {
  const id = Number(sql(`insert into public.leads (company_name, contact_name, phone, city, state, list_source, project_id, assigned_user_id)
    values (${lit(`${TAG} ${name}`)}, 'Pasty', '310-829-2481', 'Santa Monica', 'CA', 'IPA_AZ-Churches', ${DBDV}, ${SEAN}) returning id`));
  sql(`insert into public.insurance_details (lead_id, ultimate_xdate, pkg_xdate) values (${id}, '2026-12-23', '2026-12-23')`);
  return id;
};
const church = newName("Calvary Baptist Church");
const other = newName("Grace Chapel");

let mail = await startMailCatcher(2525);
const browser = await launchBrowser();
const sent = (to) => mail.messages.filter((m) => m.to.includes(to));
/** A message's text with quoted-printable soft breaks and escapes undone. */
const plain = (m) => m.raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const rows = (leadId) => JSON.parse(sql(`select coalesce(json_agg(t order by t.id), '[]') from (select id, to_address, link_only, resent, status, error, result
  from public.lead_deliveries where lead_id = ${leadId}) t`));
const pick = (page, name) => page.ev(`(() => { const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === ${JSON.stringify(name)}); if (!b) return false; b.click(); return true; })()`);

try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage();

  section("A Lead goes to the client");
  await sean.go(`/leads/${church}`, 4000);
  await pick(sean, "Lead");
  await until(() => sean.ev(`!!document.querySelector('input[name="ultimate_xdate"]')`));
  await sean.click("button", "Save:");
  check("the sheet is emailed to the project's delivery address", Boolean(await until(() => sent(SHEET_TO).length === 1, { timeout: 15000 })), JSON.stringify(mail.messages.map((m) => m.to)));
  const full = sent(SHEET_TO)[0];
  check("…as the old system named it: “Lead - <company>”", full?.headers.subject === `Lead - ${TAG} Calvary Baptist Church`, full?.headers.subject);
  const body = full ? plain(full) : "";
  check("…the full lead sheet, as HTML and as text", /multipart\/alternative/.test(full?.headers["content-type"] ?? "") && body.includes("Jacob Termini") && body.includes("IPA_AZ-Churches") && body.includes("310-829-2481"),
    full?.headers["content-type"]);
  check("…from the company's address", /alerts@signaturemktg\.net/.test(full?.headers.from ?? ""), full?.headers.from);
  check("the address marked “_” gets a link instead", Boolean(await until(() => sent(LINK_TO).length === 1, { timeout: 15000 })));
  const linkBody = sent(LINK_TO)[0] ? plain(sent(LINK_TO)[0]) : "";
  const url = linkBody.match(/https?:\/\/[^\s"<>]+\/sheet\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
  check("…to the lead sheet, not the sheet itself", Boolean(url) && !linkBody.includes("310-829-2481"), linkBody.slice(0, 300));
  const kept = rows(church);
  check("both sends are kept on the lead", kept.length === 2 && kept.every((r) => r.status === "sent" && r.result === "Lead" && !r.resent), JSON.stringify(kept));

  section("The link");
  const path = url ? new URL(url).pathname : "/sheet/none";
  const opened = await fetch(`${APP_URL}${path}`, { redirect: "manual" });
  const page = await opened.text();
  check("opens the sheet without signing in", opened.status === 200 && page.includes(`${TAG} Calvary Baptist Church`) && page.includes("310-829-2481"), `${opened.status}`);
  check("…never indexed or cached", /noindex/.test(opened.headers.get("x-robots-tag") ?? "") && /no-store/.test(opened.headers.get("cache-control") ?? ""));
  const [b, mac] = path.split("/").pop().split(".");
  const forged = Buffer.from(`${other}.${Math.floor(Date.now() / 1000) + 9999}`).toString("base64url");
  const tampered = await fetch(`${APP_URL}/sheet/${forged}.${mac}`, { redirect: "manual" });
  check("a link altered to open another lead is refused", tampered.status === 404 && !(await tampered.text()).includes("Grace Chapel"));
  check("…as is a made-up one", (await fetch(`${APP_URL}/sheet/${b}.AAAA`, { redirect: "manual" })).status === 404);

  section("On the lead sheet");
  await sean.go(`/leads/${church}`, 4000);
  await sean.click('[role=tab][data-tab="deliveries"]');
  const listed = await sean.ev(`[...document.querySelectorAll('[data-delivery-row]')].map((r) => r.innerText.replace(/\\s+/g, ' '))`);
  check("the Deliveries tab lists each send: to whom, how, sent", listed.length === 2 && listed.some((t) => t.includes(SHEET_TO) && /Lead sheet/.test(t) && /\bsent\b/i.test(t)) && listed.some((t) => t.includes(LINK_TO) && /Link/.test(t)), JSON.stringify(listed));

  section("Sending it again");
  // Made a Lead, the name moved to the appointment project, which Sean is not on:
  // whoever works it now, or an administrator, sends it again.
  check("the rep who made it a Lead, no longer on the name, has no Send again", await sean.ev(`!document.querySelector('[data-resend-delivery]')`));
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  await admin.go(`/leads/${church}`, 4000);
  await admin.click('[role=tab][data-tab="deliveries"]');
  mail.refuse = new RegExp(`^${LINK_TO.replace(/\./g, "\\.")}$`);
  const before = mail.messages.length;
  await admin.click("[data-resend-delivery]");
  check("“Send to client again” sends it again", Boolean(await until(() => mail.messages.length === before + 1 && rows(church).length === 4, { timeout: 15000 })),
    `${await admin.toasts()} · ${mail.messages.length - before} sent · ${rows(church).length} kept`);
  const again = rows(church).slice(2);
  check("…marked as sent again by hand", again.every((r) => r.resent), JSON.stringify(again));
  const refused = again.find((r) => r.to_address === LINK_TO);
  check("an address the mail service refuses is kept as not sent, with the reason", refused?.status === "failed" && /refused the address/.test(refused?.error ?? ""), JSON.stringify(refused));
  await sleep(1500);
  await admin.click('[role=tab][data-tab="deliveries"]');
  check("…and the tab shows it as Not sent", /Not sent/i.test(await admin.ev(`document.querySelector('[data-tab-panel="deliveries"]').innerText`)));
  mail.refuse = null;

  section("Delivery emails on the project");
  await admin.go(`/projects/${DBDV}`, 4000);
  const openEdit = async () => {
    await admin.click("button", "Edit");
    return until(() => admin.ev(`!!document.querySelector('[role=dialog] input[name="email"]')`));
  };
  await openEdit();
  check("the project form shows its delivery emails", (await admin.ev(`document.querySelector('[role=dialog] input[name="email"]').value`)) === `${SHEET_TO}, _${LINK_TO}`);
  await admin.fill('[role=dialog] input[name="email"]', `${SHEET_TO}, jacob at capital`);
  await admin.click("[role=dialog] button[type=submit]");
  const said = await until(() => admin.ev(`[...document.querySelectorAll('[role=dialog] [role=alert]')].map((a) => a.textContent).join(' ') || null`));
  check("…refuses one that is not an address, saying which", /Not an email address: jacob, at, capital/.test(said ?? ""), said);
  await admin.fill('[role=dialog] input[name="email"]', `${SHEET_TO}; producer.${RUN}@capital.test`);
  await admin.ev(`document.querySelector('[role=dialog] input[type=checkbox][name="delivery_link_only"]').click()`);
  await admin.click("[role=dialog] button[type=submit]");
  check("…and saves new ones, with “send a link” ticked",
    Boolean(await until(() => sql(`select email || ' ' || delivery_link_only from public.projects where id = ${DBDV}`) === `${SHEET_TO}; producer.${RUN}@capital.test true`)),
    sql(`select email || ' ' || delivery_link_only from public.projects where id = ${DBDV}`));
  await admin.go(`/projects/${DBDV}`, 4000);
  await openEdit();
  await admin.ev(`document.querySelector('[role=dialog] input[type=checkbox][name="delivery_link_only"]').click()`);
  await admin.click("[role=dialog] button[type=submit]");
  check("…and unticked again", Boolean(await until(() => sql(`select delivery_link_only from public.projects where id = ${DBDV}`) === "f")));

  section("Not every result goes to the client");
  const count = mail.messages.length;
  await sean.go(`/leads/${other}`, 4000);
  await pick(sean, "Viable-CallBack");
  await sean.click("button", "Save:");
  await sleep(4000);
  check("a Viable-CallBack sends nothing", mail.messages.length === count && rows(other).length === 0);
} finally {
  browser.close();
  await mail.close();
  sql(`update public.app_settings set value = ${lit(mailSetting)}::jsonb where key = 'mail'`);
  for (const id of [church, other]) {
    sql(`delete from public.pay_events where lead_id = ${id}`);
    sql(`delete from public.appointments where lead_id = ${id}`);
    sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${id}`);
    sql(`delete from public.leads where id = ${id}`);
  }
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("delivery");
