/**
 * Email replies on the lead (Sean, Nov 2026: "the reply email is not attaching to this thread"), end to end
 * with a stand-in for Resend run by this test. An email sent from a lead goes out with a Reply-To of its own
 * on the reply domain; the reply Resend receives there (its webhook, signed) is read in full, kept on the
 * lead under the email it answers with its own words (the quoted earlier message cut off), and the sender is
 * told in Lighthouse and sent a copy (replying to it goes to the prospect). The same reply twice is kept
 * once; an unsigned one is turned away; the Emails tab shows the reply.
 *
 * Needs the app started with:
 *   RESEND_API_KEY=re_test RESEND_API_URL=http://127.0.0.1:4813 INBOUND_REPLY_DOMAIN=reply.lighthouse-replies.net
 *   RESEND_WEBHOOK_SECRET=whsec_bGlnaHRob3VzZS1lMmUtc2VjcmV0LTAxMjM0NTY3ODkwMQ==
 *
 *   node tests/run.mjs tests/e2e/email-replies.test.mjs
 */
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { APP_URL } from "../support/env.mjs";

const PORT = Number(process.env.TEST_RESEND_PORT ?? 4813);
const SECRET = process.env.TEST_RESEND_WEBHOOK_SECRET ?? "whsec_bGlnaHRob3VzZS1lMmUtc2VjcmV0LTAxMjM0NTY3ODkwMQ==";
const TAG = `ER-E2E ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const seanEmail = sql(`select email from public.users where id = ${SEAN}`);
// Sean's own inbox for the copy: an address mail can go to (a test address gets none), through the stand-in.
const SEAN_INBOX = `sean.${Date.now()}@lighthouse-replies.net`;
const JOHN = `john.${Date.now()}@alpine-mech.net`;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, contact_name, phone, email, project_id, assigned_user_id)
  values (${lit(`${TAG} Alpine Mechanical`)}, 'John Alpine', '602-555-0142', ${lit(JOHN)}, ${project}, ${SEAN}) returning id`));
const mailSetting = sql("select value::text from public.app_settings where key = 'mail'");
sql(`update public.app_settings set value = value || '{"from": "alerts@signaturemktg.net"}'::jsonb where key = 'mail'`);

// The stand-in: Resend's sending (kept here) and its received emails (served from here).
const sent = [];
const received = new Map();
const stand = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const json = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "POST" && req.url === "/emails") {
    const id = `sent_${sent.length + 1}`;
    sent.push({ id, ...JSON.parse(raw) });
    return json(200, { id });
  }
  const m = /^\/emails\/receiving\/([\w-]+)$/.exec(req.url);
  if (req.method === "GET" && m) return received.has(m[1]) ? json(200, received.get(m[1])) : json(404, { message: "not found" });
  json(404, { message: `no stand-in for ${req.method} ${req.url}` });
});
await new Promise((ok) => stand.listen(PORT, "127.0.0.1", ok));

const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
const webhook = (event, { signed = true } = {}) => {
  const body = JSON.stringify(event);
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return fetch(`${APP_URL}/api/email/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": signed ? `v1,${sig}` : "v1,AAAA" },
    body,
  });
};

const browser = await launchBrowser({ mouse: true });
try {
  sql(`update public.users set email = ${lit(SEAN_INBOX)} where id = ${SEAN}`);

  section("Sent from the lead, with a reply address of its own");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go(`/leads/${lead}`, 7000);
  await until(() => sean.ev("!!document.querySelector('[data-email-lead]')"), { timeout: 20000 });
  await sean.ev(`document.querySelector('[data-email-lead]')?.scrollIntoView({ block: 'center' })`);
  await sean.mouseClick("[data-email-lead]");
  await until(() => sean.ev(`!!document.querySelector('[role=dialog] input[name="subject"]')`));
  await sean.fill('[role=dialog] input[name="subject"]', `${TAG} Business Insurance Quote`);
  await sean.fill('[role=dialog] textarea[name="body"]', "Hi John,\n\nHere's the list of items we need.\n\nSean");
  await sean.click("[role=dialog] button[type=submit]");
  const out = await until(() => sent.find((s) => s.to?.[0] === JOHN) ?? null, { timeout: 15000 });
  const replyTo = out?.reply_to?.[0] ?? "";
  const token = /reply-([a-f0-9]{32})@reply\.lighthouse-replies\.net/.exec(replyTo)?.[1];
  check("its Reply-To an address of its own on the reply domain", Boolean(token), replyTo);
  check("…kept with the email", Boolean(token) && sql(`select reply_token from public.lead_emails where lead_id = ${lead} and direction = 'out'`) === token);

  section("John replies");
  const replyAddr = `reply-${token}@reply.lighthouse-replies.net`;
  received.set("rcv_1", {
    id: "rcv_1", from: JOHN, to: [replyAddr], subject: `Re: ${TAG} Business Insurance Quote`,
    headers: { from: `John Alpine <${JOHN}>` },
    text: `Thanks Sean, I'll pull those together. Call me Friday.\n\nJohn\n\nOn Tue, Nov 18, 2026 at 3:31 PM Sean Fitzgerald <${replyAddr}> wrote:\n> Hi John,\n> Here's the list of items we need.`,
    html: null,
  });
  const event = { type: "email.received", created_at: new Date().toISOString(), data: { email_id: "rcv_1", from: JOHN, to: [replyAddr], subject: `Re: ${TAG} Business Insurance Quote` } };
  const r1 = await webhook(event);
  check("Resend's webhook taken", r1.status === 200, String(r1.status));
  const kept = JSON.parse(sql(`select coalesce(row_to_json(t)::text, 'null') from (select direction, status, from_address, body, user_id, in_reply_to_id is not null as answers from public.lead_emails where lead_id = ${lead} and direction = 'in') t`) || "null");
  check("kept on the lead, from John, under the email it answers, for Sean", kept?.from_address === `John Alpine <${JOHN}>` && kept.status === "received" && kept.answers && kept.user_id === SEAN, JSON.stringify(kept));
  check("…his own words, the quoted email cut off", kept?.body === "Thanks Sean, I'll pull those together. Call me Friday.\n\nJohn", JSON.stringify(kept?.body));
  const notice = JSON.parse(sql(`select coalesce(row_to_json(n)::text, 'null') from (select title, link from public.notifications where user_id = ${SEAN} and title like ${lit(`Email from ${TAG}%`)} order by id desc limit 1) n`) || "null");
  check("Sean is told, with a link to the lead's emails", notice?.link === `/leads/${lead}?tab=emails` && /John Alpine/.test(notice.title), JSON.stringify(notice));
  const copy = await until(() => sent.find((s) => s.to?.[0] === SEAN_INBOX) ?? null, { timeout: 10000 });
  check("…and sent a copy, replying to it going to John", Boolean(copy) && /I'll pull those together/.test(copy.text) && (copy.reply_to?.[0] ?? "").includes(JOHN), JSON.stringify(copy ?? {}).slice(0, 300));

  section("Resend trying again, and someone else");
  const r2 = await webhook(event);
  check("the same reply again: kept once", [200, 204].includes(r2.status) && sql(`select count(*) from public.lead_emails where lead_id = ${lead} and direction = 'in'`) === "1", String(r2.status));
  const forged = await webhook({ ...event, data: { ...event.data, email_id: "rcv_2" } }, { signed: false });
  check("an unsigned one turned away", forged.status === 401);

  section("On the Emails tab");
  await sean.go(`/leads/${lead}?tab=emails`, 6000);
  const row = await until(() => sean.ev("document.querySelector('[data-email-row=reply]')?.innerText ?? null"), { timeout: 15000 });
  check("the reply, marked so, from John", /Reply/.test(row ?? "") && /From John Alpine/.test(row ?? ""), row);
  await sleep(100);
} finally {
  browser.close();
  stand.close();
  sql(`update public.users set email = ${lit(seanEmail)} where id = ${SEAN}`);
  sql(`delete from public.notifications where user_id = ${SEAN} and title like ${lit(`Email from ${TAG}%`)}`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.lead_emails where lead_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
  if (mailSetting) sql(`update public.app_settings set value = ${lit(mailSetting)}::jsonb where key = 'mail'`);
}

finish("email replies");
