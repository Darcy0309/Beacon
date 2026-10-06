/**
 * Emailing a name's contact from its lead sheet, in a real browser, with the
 * test's own mail catcher standing in for the mail server: the Email button
 * beside Call now; the dialog with the address on file; what reaches the
 * mail server (from the company's address under the rep's name, replies to
 * the rep, to one address); the email on the lead's history; a refused
 * address, an unreachable server and the hourly limit, each said plainly
 * and kept as not sent; what shows before email is set up; and who sees
 * the button.
 *
 * Needs the app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 and any
 * SMTP_USER and SMTP_PASSWORD (TEST_SMTP_PORT for another port). Runs on its
 * own test client and removes everything it made.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";

const PORT = Number(process.env.TEST_SMTP_PORT ?? 2525);
const TAG = `EM-E2E ${Date.now()}`;
const SHOTS = process.env.SHOTS;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const DANA = `dana.${Date.now()}@capitalins.test`;
const BEN = `ben.${Date.now()}@okafor.test`;
const FROM = "alerts@signaturemktg.net";

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const newName = (name, contact, email) => Number(sql(`insert into public.leads (company_name, contact_name, phone, email, project_id, assigned_user_id)
  values (${lit(`${TAG} ${name}`)}, ${lit(contact)}, '602-555-0142', ${email ? lit(email) : "null"}, ${project}, ${SEAN}) returning id`));
const roofing = newName("Whitfield Roofing", "Dana Whitfield", DANA);
const electric = newName("Okafor Electric", "Ben Okafor", null);
const mailSetting = sql("select value::text from public.app_settings where key = 'mail'");
sql(`update public.app_settings set value = value || ${lit(JSON.stringify({ from: FROM }))}::jsonb where key = 'mail'`);

let mail = await startMailCatcher(PORT);
const browser = await launchBrowser({ mouse: true });
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);

/** The open dialog: its title, fields, focus, alerts and whether Send can be pressed. */
const dialog = (page) => page.ev(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null;
  const v = (sel) => d.querySelector(sel)?.value ?? null;
  return { title: d.querySelector('h2')?.textContent ?? '', text: d.innerText, to: v('input[name="to"]'), subject: v('input[name="subject"]'), body: v('textarea[name="body"]'),
    focused: document.activeElement?.getAttribute('name') ?? null, alerts: [...d.querySelectorAll('[role=alert]')].map((a) => a.textContent).join(' | '),
    notReady: d.querySelector('[data-email-not-ready]')?.textContent ?? null, canSend: !d.querySelector('button[type=submit]')?.disabled }; })()`);
const openEmail = async (page) => {
  // In the middle of the window: scrolled to the top edge, the sticky top bar would take the click.
  await page.ev(`document.querySelector('[data-email-lead]')?.scrollIntoView({ block: 'center' })`);
  await page.mouseClick("[data-email-lead]");
  return until(() => dialog(page));
};
const write = async (page, { to, subject, body }) => {
  if (to !== undefined) await page.fill('[role=dialog] input[name="to"]', to);
  if (subject !== undefined) await page.fill('[role=dialog] input[name="subject"]', subject);
  if (body !== undefined) await page.fill('[role=dialog] textarea[name="body"]', body);
};
const send = (page) => page.click("[role=dialog] button[type=submit]");
const kept = (leadId) => JSON.parse(sql(`select coalesce(json_agg(t order by t.id), '[]') from (select id, to_address, subject, body, status, error, message_id, user_id
  from public.lead_emails where lead_id = ${leadId}) t`));
const history = (page) => page.ev(`[...document.querySelectorAll('[data-email-row]')].map((r) => ({ text: r.innerText, open: r.open }))`);

try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage();

  section("The Email button");
  await sean.go(`/leads/${roofing}`, 4000);
  const place = await sean.ev(`(() => { const e = document.querySelector('[data-email-lead]');
    const c = [...document.querySelectorAll('a[href^="tel:"]')].find((a) => a.textContent.includes('Call now'));
    if (!e || !c) return { e: Boolean(e), c: Boolean(c) };
    const er = e.getBoundingClientRect(), cr = c.getBoundingClientRect();
    return { text: e.textContent.trim(), next: e.nextElementSibling === c, gap: Math.round(cr.left - er.right), sameRow: Math.abs(er.top - cr.top) < 4 }; })()`);
  check("an Email button on the lead sheet", place.text === "Email", JSON.stringify(place));
  check("…right beside Call now, on the same row", place.next && place.sameRow && place.gap >= 0 && place.gap <= 12, JSON.stringify(place));
  check("…and an Emails list in the history, empty so far", /No emails yet/.test(await sean.text()));
  await shot(sean, "email-button");

  let d = await openEmail(sean);
  if (d?.notReady) {
    console.error(`\nThe app says email is not set up: start it with SMTP_HOST=127.0.0.1 SMTP_PORT=${PORT} SMTP_USER=… SMTP_PASSWORD=…\n`);
  }
  check("Email opens a dialog for this name", d?.title === `Email ${TAG} Whitfield Roofing`, d?.title);
  check("…addressed to the email on file", d?.to === DANA, d?.to);
  check("…ready to type the subject", d?.focused === "subject", d?.focused);
  check("…saying it goes out from the company's address as Sean, replies to him",
    d?.text.includes(`Sent from ${FROM} as Sean Fitzgerald.`) && d?.text.includes("Replies come back to sean@beacon.test."), d?.text);
  check("…with email set up (the app was started with the catcher's SMTP_HOST and SMTP_PORT)", !d?.notReady && d?.canSend, d?.notReady ?? "");
  await shot(sean, "email-dialog");

  section("On a short screen");
  await sean.key("Escape");
  await sean.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 620, deviceScaleFactor: 1, mobile: false });
  await openEmail(sean);
  const fit = await sean.ev(`(() => { const d = document.querySelector('[role=dialog]').getBoundingClientRect();
    const b = [...document.querySelectorAll('[role=dialog] form button')].map((x) => x.getBoundingClientRect());
    const f = document.querySelector('[data-email-fields]');
    return { inDialog: b.every((r) => r.bottom <= d.bottom && r.top >= d.top), onScreen: b.every((r) => r.bottom <= innerHeight), fieldsScroll: f.scrollHeight > f.clientHeight }; })()`);
  check("Send and Cancel stay inside the dialog and on screen", fit.inDialog && fit.onScreen, JSON.stringify(fit));
  check("…the fields scroll instead", fit.fieldsScroll, JSON.stringify(fit));
  await shot(sean, "email-short-screen");
  await sean.key("Escape");
  await sean.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  d = await openEmail(sean);

  section("Nothing goes out until the email is complete");
  await write(sean, { to: `${DANA}, boss@capitalins.test`, subject: "", body: "" });
  await send(sean);
  const refused = await until(() => dialog(sean).then((x) => x?.alerts && x));
  check("two addresses, no subject and no message are each named",
    /Enter one email address/.test(refused?.alerts) && /Give the email a subject/.test(refused?.alerts) && /Write the email first/.test(refused?.alerts), refused?.alerts);
  check("…and nothing reached the mail server, or the history", mail.messages.length === 0 && kept(roofing).length === 0);

  section("Sending");
  const body = "Hi Dana,\n\nThanks for your time today. The quote we talked about is attached to our next call.\n\nSean";
  await write(sean, { to: DANA, subject: "Following up on our call", body });
  await send(sean);
  check("sent: it says so", /Email sent to/.test(await sean.waitToast(/Email sent to/, 10000)));
  check("…and the dialog closes", Boolean(await until(() => sean.ev(`!document.querySelector('[role=dialog]')`))));
  const m = mail.messages[0];
  check("the mail server got one email, for Dana alone", mail.messages.length === 1 && m.to.length === 1 && m.to[0] === DANA, JSON.stringify(m?.to));
  check("…from the company's address", m?.from === FROM && /^"?Sean Fitzgerald"? <alerts@signaturemktg\.net>$/.test(m?.headers.from ?? ""), m?.headers.from);
  check("…replies going to Sean", /sean@beacon\.test/.test(m?.headers["reply-to"] ?? ""), m?.headers["reply-to"]);
  check("…to Dana, with the subject and the message as written",
    m?.headers.to === DANA && m?.headers.subject === "Following up on our call" && m?.text.trim() === body, JSON.stringify({ to: m?.headers.to, subject: m?.headers.subject, text: m?.text }));
  check("…the app signing in to the mail server with its login", mail.logins.length >= 1 && Boolean(mail.logins[0]), JSON.stringify(mail.logins));
  const sent = kept(roofing);
  check("kept on the lead's history as sent, by Sean, with its Message-ID",
    sent.length === 1 && sent[0].status === "sent" && sent[0].user_id === SEAN && Boolean(sent[0].message_id) && sent[0].body === body, JSON.stringify(sent));
  const rows = await until(() => history(sean).then((r) => r.length === 1 && r));
  check("…and listed under Emails: subject, to whom, by whom", Boolean(rows) && rows[0].text.includes("Following up on our call") && rows[0].text.includes(`To ${DANA} · Sean Fitzgerald`), JSON.stringify(rows));
  check("…folded, the message one click away", rows && !rows[0].open && !rows[0].text.includes("Thanks for your time"));
  await sean.click("[data-email-row] summary");
  check("…which opens it in full", Boolean(await until(() => history(sean).then((r) => r[0]?.open && r[0].text.includes("Thanks for your time today")))));
  await sean.ev(`document.querySelector('[data-email-row]').scrollIntoView({ block: 'center' })`);
  await shot(sean, "email-history");

  section("An address the mail server refuses");
  mail.refuse = /^nobody@/;
  d = await openEmail(sean);
  check("the next email starts fresh", d?.to === DANA && d?.subject === "" && d?.body === "" && !d?.alerts, JSON.stringify(d));
  await write(sean, { to: "nobody@capitalins.test", subject: "Quote", body: "Hi," });
  await send(sean);
  d = await until(() => dialog(sean).then((x) => x?.alerts && x));
  check("the mail server's reason is shown", /The mail server refused the address: 550 5\.1\.1 <nobody@capitalins\.test>: Recipient address rejected/.test(d?.alerts), d?.alerts);
  check("…with what was written kept", d?.to === "nobody@capitalins.test" && d?.subject === "Quote" && d?.body === "Hi,", JSON.stringify(d));
  check("…kept on the history as not sent, with the reason", (() => {
    const last = kept(roofing).at(-1);
    return last.status === "failed" && /Recipient address rejected/.test(last.error) && !last.message_id;
  })(), JSON.stringify(kept(roofing).at(-1)));
  check("…and listed as Not sent", Boolean(await until(() => history(sean).then((r) => r.length === 2 && /Not sent/i.test(r[0].text) && r[0].text.includes("Quote")))));
  await shot(sean, "email-refused");
  await sean.ev(`document.querySelector('[data-email-row]').scrollIntoView({ block: 'center' })`);
  await sean.key("Escape");
  await until(() => sean.ev(`!document.querySelector('[role=dialog]')`));
  d = await openEmail(sean);
  check("closed and opened again: the draft is still there, the old error is not", d?.to === "nobody@capitalins.test" && d?.subject === "Quote" && !d?.alerts, JSON.stringify(d));

  section("The mail server out of reach");
  await mail.close();
  await write(sean, { to: DANA });
  await send(sean);
  d = await until(() => dialog(sean).then((x) => x?.alerts && x), { timeout: 15000 });
  check("it says the mail server could not be reached", /Couldn't reach the mail server/.test(d?.alerts), d?.alerts);
  check("…kept as not sent", kept(roofing).at(-1)?.status === "failed" && kept(roofing).length === 3);
  mail = await startMailCatcher(PORT);
  await sean.key("Escape");

  section("A name with no email on file");
  await sean.go(`/leads/${electric}`, 4000);
  d = await openEmail(sean);
  check("the address is left to type, with the reason", d?.to === "" && d?.focused === "to" && /No email on file/.test(d?.text), JSON.stringify(d));
  check("…and the greeting suggests the contact's name", await sean.ev(`document.querySelector('[role=dialog] textarea[name="body"]')?.placeholder`) === "Hi Ben,");

  section("At most 50 an hour each");
  sql(`insert into public.lead_emails (lead_id, user_id, to_address, subject, body, status)
    select ${electric}, ${SEAN}, ${lit(BEN)}, 'Earlier', 'Earlier', 'sent' from generate_series(1, 50)`);
  await write(sean, { to: BEN, subject: "Your quote", body: "Hi Ben," });
  await send(sean);
  d = await until(() => dialog(sean).then((x) => x?.alerts && x));
  check("the 51st in an hour is refused, saying why", /You've sent 50 emails in the last hour/.test(d?.alerts), d?.alerts);
  check("…and nothing goes out", mail.messages.length === 0 && kept(electric).length === 50);
  sql(`delete from public.lead_emails where lead_id = ${electric}`);
  await send(sean);
  check("an hour on (here: those removed), it goes", /Email sent to/.test(await sean.waitToast(/Email sent to/, 10000)) && mail.messages[0]?.to[0] === BEN);

  section("Before email is set up");
  sql("update public.app_settings set value = value - 'from' where key = 'mail'");
  await sean.go(`/leads/${roofing}`, 4000);
  d = await openEmail(sean);
  check("with no From address, the dialog says so", /There's no address to send from yet/.test(d?.notReady ?? ""), d?.notReady);
  check("…and who can fix it", /Ask an administrator/.test(d?.notReady ?? ""), d?.notReady);
  check("…and Send stays off", d?.canSend === false);
  sql(`update public.app_settings set value = value || ${lit(JSON.stringify({ from: FROM }))}::jsonb where key = 'mail'`);
  await sean.key("Escape");

  section("Who sees the button");
  const tyler = await (await browser.newContext({ as: "agent@beacon.test" })).newPage();
  await tyler.go(`/leads/${roofing}`, 4000);
  check("an agent not on the name: no Email button", await tyler.ev(`!document.querySelector('[data-email-lead]')`));
  check("…though staff can read what was sent", (await history(tyler)).length === 3);
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  await admin.go(`/leads/${roofing}`, 4000);
  check("an administrator: the button, on any name", await admin.ev(`!!document.querySelector('[data-email-lead]')`));

  section("Settings");
  await admin.go("/settings", 4000);
  const server = await admin.ev(`document.querySelector('[data-mail-server]')?.innerText ?? ''`);
  check("Settings shows the mail server the app sends through and its login", server.includes(`127.0.0.1:${PORT}`) && server.includes(`signed in as ${mail.logins[0] ?? ""}`), server);
  check("…never the password, and no server fields to type into", await admin.ev(`!document.querySelector('input[name="mail_host"], input[name="mail_provider"]')`) && /never here/.test(server));
  check("…and the From address", await admin.ev(`document.querySelector('input[name="mail_from"]')?.value`) === FROM);
  await shot(admin, "email-settings");
} finally {
  browser.close();
  await mail.close();
  sql(`update public.app_settings set value = ${lit(mailSetting)}::jsonb where key = 'mail'`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id in (${roofing}, ${electric})`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("email");
