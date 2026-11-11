/**
 * Email templates (client, Nov 2026), in a real browser with the test's own mail catcher: an
 * administrator adds one in Settings (a subject and message naming the contact and company, and a
 * file); a manager picks it in a lead's Email box, which fills it in for that lead with their
 * signature and brings the file, and sends it, the file attached; a file left off stays off; the
 * email on the lead's history with what it carried; a paused template off the list; only
 * administrators keep them. And talk to type in the message box.
 *
 * Needs the app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (any SMTP login).
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { signIn, adminClient } from "../support/auth.mjs";
import { startMailCatcher } from "../support/smtp.mjs";

const PORT = Number(process.env.TEST_SMTP_PORT ?? 2525);
const TAG = `ET-E2E ${Date.now()}`;
const SHOTS = process.env.SHOTS;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const JOHN = `john.${Date.now()}@alpine.test`;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, contact_name, phone, email, project_id, assigned_user_id)
  values (${lit(`${TAG} Alpine Mechanical`)}, 'John Alpine', '602-555-0142', ${lit(JOHN)}, ${project}, ${SEAN}) returning id`));
// Its appointment (Nov 2026): the template's {appt_date}, {appt_time} and {agent_name} come from it.
sql(`insert into public.appointments (lead_id, user_id, project_id, set_stage, appt_date, appt_time, duration_min, rep_name, status_id, qa_status)
  values (${lead}, ${SEAN}, ${project}, 'dbdev', '2027-01-04', '10:00 AM', 30, 'Jen Carter', (select id from public.appointment_statuses where name = 'Scheduled'), 'pending')`);
const mailSetting = sql("select value::text from public.app_settings where key = 'mail'");
sql(`update public.app_settings set value = value || '{"from": "alerts@signaturemktg.net"}'::jsonb where key = 'mail'`);

// The file the template carries: a small PDF.
const dir = mkdtempSync(join(tmpdir(), "lighthouse-et-"));
const PDF = join(dir, "price-sheet.pdf");
writeFileSync(PDF, "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

const mail = await startMailCatcher(PORT);
const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });
const NAME = `${TAG} Renewal follow-up`;
const template = () => JSON.parse(sql(`select coalesce(row_to_json(t)::text, 'null') from (select id, subject, body, attachments, active from public.email_templates where name = ${lit(NAME)}) t`) || "null");

try {
  section("An administrator adds a template in Settings");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go("/settings", 7000);
  await when(admin, "!!document.querySelector('[data-new-template]')");
  await admin.ev("document.querySelector('[data-new-template]').click(), true");
  await when(admin, "!!document.querySelector('[data-template-dialog] [data-template-name]')");
  await admin.fill("[data-template-name]", NAME);
  await admin.fill("[data-template-subject]", "Your renewal, {company}");
  await admin.fill("[data-template-body]", "Hi {first_name},\n\nThanks for your time today. Our price sheet is attached.\nSee you {appt_date} at {appt_time} with {agent_name}.");
  const { root } = await admin.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await admin.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-template-file-input]" });
  await admin.send("DOM.setFileInputFiles", { nodeId, files: [PDF] });
  check("a file added to it", Boolean(await when(admin, "!!document.querySelector('[data-template-file=\"price-sheet.pdf\"]')")));
  if (SHOTS) await admin.screenshot(`${SHOTS}/template-editor.png`);
  await admin.ev("document.querySelector('[data-template-save]').click(), true");
  const saved = await until(() => template(), { timeout: 10000 });
  check("saved: its subject, message and file", saved?.subject === "Your renewal, {company}" && saved.attachments.length === 1 && saved.attachments[0].name === "price-sheet.pdf"
    && /^template\/[0-9a-f-]{36}\/price-sheet\.pdf$/.test(saved.attachments[0].path), JSON.stringify(saved));
  check("…listed on Settings", Boolean(await when(admin, `!!document.querySelector('[data-template=${JSON.stringify(NAME)}]')`)));

  section("Only administrators keep them");
  const sean = await signIn("sean@beacon.test");
  const tried = await sean.sb.from("email_templates").insert({ name: `${TAG} sneaky`, subject: "x", body: "y" }).select();
  check("a manager can't add one", Boolean(tried.error) || !(tried.data ?? []).length, JSON.stringify(tried.error ?? tried.data));
  const changed = await sean.sb.from("email_templates").update({ subject: "hacked" }).eq("id", saved.id).select();
  check("…nor change one", !(changed.data ?? []).length && template().subject === "Your renewal, {company}");
  const upload = await sean.sb.storage.from("email-templates").upload(`template/${crypto.randomUUID()}/x.pdf`, new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  check("…nor put a file among theirs", Boolean(upload.error), JSON.stringify(upload.error ?? upload.data));

  section("A manager picks it in a lead's Email box");
  const manager = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await manager.go(`/leads/${lead}`, 6000);
  await manager.ev(`document.querySelector('[data-email-lead]')?.scrollIntoView({ block: 'center' })`);
  await manager.mouseClick("[data-email-lead]");
  await when(manager, "!!document.querySelector('[role=dialog] [data-email-template]')");
  const options = await manager.ev("[...document.querySelectorAll('[data-email-template] option')].map((o) => o.textContent)");
  check("the template on the list, with its file", options.includes(`${NAME} · 1 file`), JSON.stringify(options));
  await manager.fill("[data-email-template]", String(saved.id));
  const filled = await until(() => manager.ev(`(() => { const d = document.querySelector('[role=dialog]'); const s = d.querySelector('input[name="subject"]').value;
    return s ? { subject: s, body: d.querySelector('textarea[name="body"]').value, files: [...d.querySelectorAll('[data-email-attachment]')].map((f) => f.dataset.emailAttachment) } : null; })()`));
  check("it fills in the subject for this lead", filled?.subject === `Your renewal, ${TAG} Alpine Mechanical`, JSON.stringify(filled));
  check("…and the message: the contact's name, the appointment and its agent, then their signature", /^Hi John,\n\nThanks for your time today\. Our price sheet is attached\.\nSee you Monday, January 4, 2027 at 10:00 AM with Jen Carter\.\n\n/.test(filled?.body ?? "") && /Sean Fitzgerald/.test(filled?.body ?? ""), filled?.body);
  check("…with its file", JSON.stringify(filled?.files) === JSON.stringify(["price-sheet.pdf"]));
  const speech = await manager.ev("!!(window.SpeechRecognition || window.webkitSpeechRecognition)");
  check("talk to type in the message box (where the browser has it)", speech ? Boolean(await manager.ev("!!document.querySelector('[role=dialog] [data-dictation]')")) : !(await manager.ev("!!document.querySelector('[role=dialog] [data-dictation]')")), String(speech));
  if (SHOTS) await manager.screenshot(`${SHOTS}/email-template-picked.png`);
  await manager.click("[role=dialog] button[type=submit]");
  const m = await until(() => mail.messages.find((x) => x.to.includes(JOHN)) ?? null, { timeout: 15000 });
  check("sent: the subject filled in", /Your renewal/.test(m?.raw ?? ""), m?.headers?.subject);
  check("…the file attached", /Content-Disposition: attachment;\s*filename="?price-sheet\.pdf/i.test(m?.raw ?? ""), (m?.raw ?? "").slice(0, 400));
  const row = JSON.parse(sql(`select row_to_json(t)::text from (select template_id, attachments, status from public.lead_emails where lead_id = ${lead} order by id desc limit 1) t`));
  check("…kept on the lead's history with the template and what it carried", row.template_id === saved.id && JSON.stringify(row.attachments) === '["price-sheet.pdf"]' && row.status === "sent", JSON.stringify(row));
  await manager.go(`/leads/${lead}`, 5000);
  await manager.click('[role=tab][data-tab="emails"]');
  check("…the files named there", /price-sheet\.pdf/.test((await when(manager, "document.querySelector('[data-email-row] [data-email-attachments]')?.textContent")) ?? ""));

  section("A file left off stays off");
  await manager.ev(`document.querySelector('[data-email-lead]')?.scrollIntoView({ block: 'center' })`);
  await manager.mouseClick("[data-email-lead]");
  await when(manager, "!!document.querySelector('[role=dialog] [data-email-template]')");
  await manager.fill("[data-email-template]", String(saved.id));
  await when(manager, "!!document.querySelector('[data-email-attachment]')");
  await manager.ev("document.querySelector('[data-email-attachment] button').click(), true");
  await sleep(200);
  const before = mail.messages.length;
  await manager.click("[role=dialog] button[type=submit]");
  const plain = await until(() => (mail.messages.length > before ? mail.messages.at(-1) : null), { timeout: 15000 });
  check("sent without it", Boolean(plain) && !/price-sheet\.pdf/.test(plain.raw), (plain?.raw ?? "").slice(0, 300));

  section("Paused: off the list");
  sql(`update public.email_templates set active = false where id = ${saved.id}`);
  await manager.go(`/leads/${lead}`, 5000);
  await manager.ev(`document.querySelector('[data-email-lead]')?.scrollIntoView({ block: 'center' })`);
  await manager.mouseClick("[data-email-lead]");
  await when(manager, "!!document.querySelector('[role=dialog]')");
  await sleep(500);
  check("a paused template isn't offered", !(await manager.ev(`[...document.querySelectorAll('[data-email-template] option')].some((o) => o.textContent.includes(${JSON.stringify(NAME)}))`)));
} finally {
  browser.close();
  await mail.close();
  const t = template();
  if (t?.attachments?.length) await adminClient().storage.from("email-templates").remove(t.attachments.map((a) => a.path)).catch(() => {});
  sql(`delete from public.email_templates where name like ${lit(`${TAG}%`)}`);
  sql(`update public.app_settings set value = ${lit(mailSetting)}::jsonb where key = 'mail'`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("email templates");
