/**
 * A lead's Conversation (client, Nov 2026), in a real browser: the calls on the Lighthouse phone with
 * the lead's numbers (a recording to play), the texts sent and received as one thread; a reply texted
 * in to the lead's number lands on it (asked for while open) and its rep is told; Twilio's word on a
 * text sent (delivered; never back to "sent"); the date filter; and texting from the box, which says
 * why when Twilio refuses (here, with keys Twilio doesn't know) and keeps the text as not sent.
 *
 * Needs the app started with Twilio keys, the Account SID and Auth Token given here too:
 *   TEST_TWILIO_ACCOUNT_SID, TEST_TWILIO_AUTH_TOKEN (the app's own). Skipped without them.
 *
 *   SHOTS=<dir> to keep screenshots.
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { APP_URL } from "../support/env.mjs";
import { twilioSignature } from "../../src/lib/twilio-voice.js";

const ACCOUNT = process.env.TEST_TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TEST_TWILIO_AUTH_TOKEN;
if (!ACCOUNT || !TOKEN) {
  console.log("Skipped: give TEST_TWILIO_ACCOUNT_SID and TEST_TWILIO_AUTH_TOKEN (the app's own) to run the Conversation checks.");
  process.exit(0);
}

const SHOTS = process.env.SHOTS;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n / 2))].map((b) => b.toString(16).padStart(2, "0")).join("");
const TAG = `CONV-E2E ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const tail = String(Date.now()).slice(-4);
const MOBILE = `480555${tail}`;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, contact_name, phone, contact_mobile, project_id, assigned_user_id)
  values (${lit(`${TAG} Coastline Auto`)}, 'Marco Ruiz', '602-555-0100', ${lit(`(480) 555-${tail}`)}, ${project}, ${SEAN}) returning id`));

// A call out to the mobile yesterday, answered, 4m 12s, recorded by Sean; and a text sent then, delivered later.
const PARENT = `CA${hex(32)}`;
const REC = `RE${hex(32)}`;
const SENT = `SM${hex(32)}`;
sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, started_at, answered_at, ended_at, talk_seconds)
  values (${lit(`CA${hex(32)}`)}, ${lit(PARENT)}, ${SEAN}, 'out', '+1${MOBILE}', 'completed', now() - interval '1 day', now() - interval '1 day', now() - interval '1 day' + interval '252 seconds', 252)`);
sql(`insert into public.phone_recordings (recording_sid, call_sid, user_id, number, seconds, lead_id) values (${lit(REC)}, ${lit(PARENT)}, ${SEAN}, ${lit(MOBILE)}, 252, ${lead})`);
sql(`insert into public.lead_texts (lead_id, user_id, direction, from_number, to_number, body, status, twilio_sid, created_at)
  values (${lead}, ${SEAN}, 'out', '+15555550100', '+1${MOBILE}', 'Hi Marco, here is the pricing we discussed.', 'sent', ${lit(SENT)}, now() - interval '1 day' + interval '7 minutes')`);
// The result Sean logged for that call (the old Call History, now on the Conversation), and one logged
// three days ago with no call on the Lighthouse phone to go on (called from another phone).
sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, call_result, notes) values
  (${lead}, ${project}, ${SEAN}, now() - interval '1 day' + interval '5 minutes', 'Viable-CallBack', 'Wants the pricing by text'),
  (${lead}, ${project}, ${SEAN}, now() - interval '3 days', 'No Answer', null)`);

const hook = async (fields, step = "") => {
  const url = `${APP_URL}/api/twilio/sms${step ? `?step=${step}` : ""}`;
  const params = { AccountSid: ACCOUNT, ...fields };
  return (await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(TOKEN, url, params) },
    body: new URLSearchParams(params),
  })).status;
};
const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });
const thread = (page) => page.ev(`[...document.querySelectorAll('[data-conversation-thread] > [data-conversation-call], [data-conversation-thread] > [data-conversation-text]')]
  .map((e) => ({ kind: e.dataset.conversationCall ? 'call:' + e.dataset.conversationCall : 'text:' + e.dataset.conversationText, status: e.dataset.textStatus ?? null, text: e.innerText }))`);

try {
  section("The thread: calls and texts with the lead");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go(`/leads/${lead}?tab=conversation`, 7000);
  await when(sean, "!!document.querySelector('[data-lead-conversation]')?.offsetParent");
  let seen = await thread(sean);
  check("opened on the Conversation tab from its link", Boolean(seen.length), JSON.stringify(seen));
  check("the call out: how long, how it went, the numbers, who", seen[0]?.kind === "call:out" && /Outgoing call/.test(seen[0].text) && /4m 12s/.test(seen[0].text) && /Completed/.test(seen[0].text)
    && seen[0].text.includes(`(480) 555-${tail}`) && /Sean/.test(seen[0].text), JSON.stringify(seen[0]));
  check("…its recording to play, for the person who recorded it", Boolean(await sean.ev("!!document.querySelector('[data-conversation-call] [data-recording-play]')")));
  check("…with the result logged for it, and what was said", /Viable-CallBack/.test(seen[0]?.text ?? "") && /Wants the pricing by text/.test(seen[0]?.text ?? ""), JSON.stringify(seen[0]));
  const alone = await sean.ev(`[...document.querySelectorAll('[data-conversation-thread] > *')].map((e) => e.matches('[data-conversation-result]') ? 'result:' + e.innerText : e.dataset.conversationCall ? 'call' : 'other')`);
  check("a result with no call on the Lighthouse phone stands by itself, first (oldest)", /^result:[\s\S]*Call logged[\s\S]*No Answer/.test(alone?.[0] ?? "") && alone[1] === "call", JSON.stringify(alone));
  check("no Call History tab: it is all on the Conversation", !(await sean.ev(`[...document.querySelectorAll('[role=tab]')].some((t) => /Call History/.test(t.textContent))`)));
  check("then the text sent, oldest first", seen[1]?.kind === "text:out" && /here is the pricing/.test(seen[1].text) && /Sent/.test(seen[1].text), JSON.stringify(seen[1]));

  section("Twilio's word on a text sent");
  await hook({ MessageSid: SENT, MessageStatus: "delivered" }, "status");
  await hook({ MessageSid: SENT, MessageStatus: "sent" }, "status");
  check("delivered, and not back to sent after", sql(`select status from public.lead_texts where twilio_sid = ${lit(SENT)}`) === "delivered");

  section("A reply texted in");
  const REPLY = `SM${hex(32)}`;
  const reply = { MessageSid: REPLY, From: `+1${MOBILE}`, To: "+15555550100", Body: "Pricing looks fair. Can we do a walkthrough Friday?", NumMedia: "0" };
  check("taken", (await hook(reply)) === 200);
  await hook(reply);
  check("kept once on the lead, however often Twilio sends it", Number(sql(`select count(*) from public.lead_texts where twilio_sid = ${lit(REPLY)} and lead_id = ${lead} and direction = 'in'`)) === 1);
  const notice = JSON.parse(sql(`select row_to_json(t)::text from (select title, body, link from public.notifications where user_id = ${SEAN} and title like ${lit(`Text from ${TAG}%`)} order by id desc limit 1) t`) || "null");
  check("whoever last texted the number is told, with the reply and a link to the Conversation",
    notice?.title === `Text from ${TAG} Coastline Auto · Marco Ruiz` && /walkthrough Friday/.test(notice.body) && notice.link === `/leads/${lead}?tab=conversation`, JSON.stringify(notice));
  const landed = await until(async () => ((await thread(sean)).find((i) => i.kind === "text:in") ?? null), { timeout: 25000 });
  check("…and it shows up on the open Conversation by itself", /walkthrough Friday/.test(landed?.text ?? ""), JSON.stringify(landed));
  seen = await thread(sean);
  check("the text sent now reads Delivered", /Delivered/.test(seen.find((i) => i.kind === "text:out")?.text ?? ""));
  if (SHOTS) await sean.screenshot(`${SHOTS}/conversation.png`);

  section("The date filter");
  const tomorrow = sql("select to_char(now() + interval '2 days', 'YYYY-MM-DD')");
  await sean.fill("[data-conversation-from]", tomorrow);
  await sleep(300);
  check("nothing from a later day", (await thread(sean)).length === 0 && /Nothing between those dates/.test(await sean.ev("document.querySelector('[data-conversation-thread]').innerText")));
  const today = sql("select to_char(now() at time zone public.business_tz(), 'YYYY-MM-DD')");
  await sean.fill("[data-conversation-from]", today);
  await sleep(300);
  seen = await thread(sean);
  check("…today's only: the reply", seen.length === 1 && seen[0].kind === "text:in", JSON.stringify(seen.map((i) => i.kind)));
  await sean.click("[data-conversation-clear]");
  await sleep(300);
  check("cleared: all of it", (await thread(sean)).length === 3);

  section("A Text button by each number on the contact card");
  await sean.ev(`document.querySelector('[role=tab][data-tab=appointments]').click(); window.scrollTo(0, 0)`);
  await sleep(300);
  check("beside the business phone's Call button", (await sean.ev(`!!document.querySelector('[data-contact-line="Business phone"] [data-text-number="6025550100"]')`)));
  await sean.ev(`document.querySelector('[data-contact-line="Business phone"] [data-text-number]').click()`);
  const focused = await when(sean, `document.activeElement?.matches('[data-conversation-body]') || null`, 5000);
  check("pressed: the Conversation tab open", (await sean.ev(`document.querySelector('[role=tab][data-tab=conversation]').getAttribute('aria-selected')`)) === "true");
  check("…that number chosen to text", (await sean.ev("document.querySelector('[data-conversation-to-number]')?.value")) === "6025550100");
  check("…and the cursor in the message box", focused === true);
  await sleep(800);
  check("…in view", await sean.ev(`(() => { const r = document.querySelector('[data-conversation-reply]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; })()`));
  if (SHOTS) await sean.screenshot(`${SHOTS}/conversation-text-button.png`);
  await sean.ev(`document.querySelector('[data-person="Contact"] [data-contact-line="Mobile"] [data-text-number]').click()`);
  await sleep(300);
  check("the mobile's Text button picks the mobile", (await sean.ev("document.querySelector('[data-conversation-to-number]')?.value")) === MOBILE);

  section("Texting from the box");
  check("to the mobile, the lead's first", (await sean.ev("document.querySelector('[data-conversation-to-number]')?.value")) === MOBILE);
  await sean.fill("[data-conversation-body]", "Friday at 10 works. See you then!");
  await sean.click("[data-conversation-send]"); // a DOM click: the "Turn on" desktop-notifications prompt may sit over it
  const said = await when(sean, "document.querySelector('[data-conversation-error]')?.textContent", 20000);
  check("Twilio refusing it (keys it doesn't know) is said, in words", /Twilio refused it|couldn't be sent/.test(said ?? ""), said);
  const failed = await until(async () => ((await thread(sean)).find((i) => i.kind === "text:out" && i.status === "failed") ?? null), { timeout: 10000 });
  check("…and kept on the thread as not sent", /Friday at 10 works/.test(failed?.text ?? "") && /Not sent/.test(failed?.text ?? ""), JSON.stringify(failed));
  check("…the message still in the box to try again", (await sean.ev("document.querySelector('[data-conversation-body]').value")) === "Friday at 10 works. See you then!");
  if (SHOTS) await sean.screenshot(`${SHOTS}/conversation-refused.png`);

  section("Only Twilio can tell of texts");
  const forged = await fetch(`${APP_URL}/api/twilio/sms`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...reply, MessageSid: `SM${hex(32)}`, AccountSid: ACCOUNT }) });
  check("an unsigned text is turned away", forged.status === 403);
} finally {
  browser.close();
  sql(`delete from public.notifications where title like ${lit(`Text from ${TAG}%`)}`);
  sql(`delete from public.lead_texts where lead_id = ${lead} or from_number = '+1${MOBILE}'`);
  sql(`delete from public.phone_recordings where recording_sid = ${lit(REC)}`);
  sql(`delete from public.phone_calls where parent_sid = ${lit(PARENT)}`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("lead conversation");
