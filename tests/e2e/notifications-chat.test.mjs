/**
 * Opening a notification and replying to whoever sent it: two people chat in
 * two separate browser sessions, with live replies and read receipts.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, sleep, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const id = (email) => sql(`select id from public.users where email=${lit(email)}`);
const AGENT = id("agent@beacon.test");
const MANAGER = id("sean@beacon.test");
const clear = () => sql("delete from public.notifications where title like '%Chat test%' or body like 'chat-test%'");
clear();

// A manager's direct message to the agent, and an automatic notice with no sender.
const manager = await signIn("sean@beacon.test");
const { error: sendErr } = await manager.sb.rpc("send_notification", {
  p_user_ids: [Number(AGENT)], p_roles: [], p_title: "Chat test: team meeting at 3",
  p_body: "chat-test Bring your call sheets.\nAnd the Q3 renewal list — the whole thing, not just the first page.", p_link: "/calendar",
});
check("manager sends a direct message", !sendErr, sendErr?.message);
const msgId = sql(`select id from public.notifications where user_id=${AGENT} and title='Chat test: team meeting at 3'`);
sql(`insert into public.notifications (user_id, kind, title, body) values (${AGENT}, 'system', 'Chat test: nightly import finished', 'chat-test 120 leads added.')`);
const sysId = sql("select id from public.notifications where title='Chat test: nightly import finished'");

const browser = await launchBrowser();
const agent = await (await browser.newContext({ as: "agent@beacon.test" })).newPage();
const mgr = await (await browser.newContext({ as: "sean@beacon.test" })).newPage();
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);

try {
  // The agent opens it from the bell.
  await agent.go("/");
  await agent.click('button[aria-label^="Notifications"]');
  await sleep(1200);
  const clicked = await agent.ev(`(() => { const b = [...document.querySelectorAll('[data-notification-panel] button')].find((x) => x.innerText.includes('Chat test: team meeting')); if (!b) return false; b.click(); return true; })()`);
  check("message is in the agent's bell", clicked);
  check("clicking it opens the notification's page", await until(async () => (await agent.path()) === `/notifications/${msgId}`), await agent.path());
  await sleep(1500);
  let t = await agent.text();
  check("full text shown, both lines", t.includes("Bring your call sheets.") && t.includes("the whole thing, not just the first page"));
  check("sender shown with role", /Sean Fitzgerald\s*·\s*Account manager/.test(t));
  check("received time shown", /Received\s*\n?\s*\w{3}, \w{3} \d+, \d+:\d\d/i.test(t));
  check("link button for the calendar", /Open calendar/i.test(t) && (await agent.ev(`!!document.querySelector('a[href="/calendar"]')`)));
  check("conversation panel with a reply box", /Conversation with Sean Fitzgerald/i.test(t) && (await agent.ev(`!!document.querySelector('textarea[name="body"]')`)));
  check("marked read in the database", await until(() => sql(`select read_at is not null from public.notifications where id=${msgId}`) === "t"));

  // The agent replies with Enter.
  await agent.fill('textarea[name="body"]', "chat-test On my way, sheets printed.");
  await agent.key("Enter");
  check("reply appears in the conversation, marked Sent", await until(async () => { const x = await agent.text(); return x.includes("On my way, sheets printed.") && /·\s*Sent/.test(x); }));
  check("box cleared after sending", (await agent.ev(`document.querySelector('textarea[name="body"]').value`)) === "");
  const replyRow = sql(`select title || '|' || reply_to || '|' || kind from public.notifications where user_id=${MANAGER} and sender_id=${AGENT} and body='chat-test On my way, sheets printed.'`);
  check("reply stored for the manager, linked to the message", replyRow === `Re: Chat test: team meeting at 3|${msgId}|message`, replyRow);
  const replyId = sql("select id from public.notifications where body='chat-test On my way, sheets printed.'");

  // The manager finds it in the inbox and opens the whole conversation.
  await mgr.go("/notifications");
  t = await mgr.text();
  check("reply is in the manager's inbox", t.includes("Re: Chat test: team meeting at 3"));
  check("…with an Open to reply hint", /Open to reply/.test(t));
  // Sent items are the <details> rows with read receipts.
  const sent = await mgr.ev(`[...document.querySelectorAll('details')].map((d) => d.innerText).join(' | ')`);
  check("Sent list shows the message, not the reply", sent.includes("Chat test: team meeting at 3") && !sent.includes("Re: Chat test"), sent.slice(0, 120));
  await mgr.ev(`[...document.querySelectorAll('ul li button')].find((b) => b.innerText.includes('Re: Chat test'))?.click()`);
  check("manager lands on the reply's page", await until(async () => (await mgr.path()) === `/notifications/${replyId}`), await mgr.path());
  await sleep(1500);
  const order = await mgr.ev(`[...document.querySelectorAll('[data-message]')].map((e) => e.dataset.message + ':' + e.innerText.split('\\n')[0]).join(' / ')`);
  check("conversation in order, both sides", /^mine:Chat test: team meeting at 3.*theirs:chat-test On my way/.test(order), order);
  check("agent sees 'Seen' live once the manager opened it", await until(async () => /·\s*Seen/.test(await agent.text()), { timeout: 8000 }));

  // The manager answers; it arrives live on the agent's open page, without a pop-up.
  await mgr.fill('textarea[name="body"]', "chat-test Thanks — see you at 3.");
  await mgr.key("Enter");
  check("manager's answer appears live on the agent's page", await until(async () => (await agent.text()).includes("Thanks — see you at 3."), { timeout: 10000 }));
  check("no pop-up for a message already on screen", !/see you at 3/.test((await agent.toasts()) ?? ""));
  check("…and it is marked read", await until(() => sql(`select count(*) from public.notifications where user_id=${AGENT} and body='chat-test Thanks — see you at 3.' and read_at is not null`) === "1"));
  await shot(agent, "agent-thread");
  await shot(mgr, "manager-thread");

  // A notice with no sender: details only, no reply box.
  await agent.go(`/notifications/${sysId}`);
  t = await agent.text();
  check("automatic notice shows its details", t.includes("120 leads added.") && t.includes("Lighthouse (automatic)"));
  check("…and no reply box", !(await agent.ev(`!!document.querySelector('textarea[name="body"]')`)));
  check("…and is marked read", await until(() => sql(`select read_at is not null from public.notifications where id=${sysId}`) === "t"));

  // Someone else's notification is not found.
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage();
  await client.go(`/notifications/${msgId}`);
  check("client cannot open the agent's notification", /could not be found|not found|does not exist/i.test(await client.text()));
  await client.go("/notifications/abc");
  check("a malformed id is a 404 too", /not found|does not exist/i.test(await client.text()));

  // Phone width.
  const phone = await (await browser.newContext({ as: "agent@beacon.test" })).newPage({ width: 390, height: 844 });
  await phone.go(`/notifications/${msgId}`, 4000);
  const overflow = await phone.ev("document.documentElement.scrollWidth - document.documentElement.clientWidth");
  check("no sideways scrolling on a phone", overflow <= 0, `overflow ${overflow}px`);
  await shot(phone, "phone-thread");
} finally {
  clear();
  browser.close();
}

finish("notification chat");
