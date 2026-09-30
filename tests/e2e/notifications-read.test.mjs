/**
 * Reading a notification anywhere (the bell, the inbox, its own page, another
 * tab) clears it from the bell's count and takes down its pop-up.
 *
 *   npm run test:e2e
 */
import { check, finish, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const AGENT = sql("select id from public.users where email='agent@beacon.test'");
const clear = () => sql("delete from public.notifications where title like 'Read test%'");
clear();
sql(`update public.notifications set read_at = coalesce(read_at, now()) where user_id=${AGENT}`); // start at zero unread

const manager = await signIn("sean@beacon.test");
async function message(title) {
  const { error } = await manager.sb.rpc("send_notification", { p_user_ids: [Number(AGENT)], p_roles: [], p_title: title, p_body: "read-test body", p_link: null });
  if (error) throw error;
  return sql(`select id from public.notifications where user_id=${AGENT} and title=${lit(title)}`);
}

const browser = await launchBrowser();
const agent = await browser.newContext({ as: "agent@beacon.test" });
const a = await agent.newPage();
const b = await agent.newPage(); // a second tab, same person
const bell = (tab) => tab.ev(`document.querySelector('button[aria-label^="Notifications"]')?.getAttribute('aria-label') ?? 'no bell'`);
const bellIs = (tab, label, timeout) => until(async () => (await bell(tab)) === label, { timeout });
const openBell = async (tab) => {
  await tab.pointer('button[aria-label^="Notifications"]');
  await until(() => tab.ev(`!!document.querySelector('[role=menu]')`), { timeout: 2000 });
};

try {
  await a.go("/leads");
  await b.go("/");
  check("both tabs start with no unread", (await bell(a)) === "Notifications" && (await bell(b)) === "Notifications", `${await bell(a)} / ${await bell(b)}`);

  // 1. A pop-up arrives; opening it from the bell clears the pop-up and the count everywhere.
  await a.front();
  await message("Read test one");
  check("pop-up appears", await until(async () => /Read test one/.test(await a.toasts())));
  check("count shows 1", await bellIs(a, "Notifications, 1 unread"), await bell(a));
  check("the other tab counts it too", await bellIs(b, "Notifications, 1 unread"), await bell(b));
  await openBell(a);
  await a.ev(`[...document.querySelectorAll('[role=menu] button')].find((x) => x.innerText.includes('Read test one'))?.click()`);
  check("opening it closes its pop-up at once", await until(async () => !/Read test one/.test(await a.toasts()), { timeout: 2000 }), await a.toasts());
  check("count clears in this tab", await bellIs(a, "Notifications"), await bell(a));
  check("…and in the other tab, without switching to it", await bellIs(b, "Notifications"), await bell(b));

  // 2. The inbox's own "Mark read" clears the bell straight away.
  //    (Leave the conversation first: a message arriving in an open conversation is read there.)
  await a.go("/leads", 2500);
  const two = await message("Read test two");
  await a.go("/notifications");
  check("inbox shows it unread, bell shows 1", (await bell(a)) === "Notifications, 1 unread", await bell(a));
  await a.ev(`(() => { const li = [...document.querySelectorAll('ul li')].find((li) => li.innerText.includes('Read test two')); [...(li?.querySelectorAll('button') ?? [])].find((x) => /mark read/i.test(x.innerText))?.click(); })()`);
  check("Mark read in the inbox clears the bell", await bellIs(a, "Notifications"), await bell(a));
  check("…stored as read", sql(`select read_at is not null from public.notifications where id=${two}`) === "t");

  // 3. Three arrive; the inbox's "Mark all read" clears the bell in both tabs.
  await message("Read test three");
  await message("Read test four");
  await message("Read test five");
  await a.go("/notifications", 2500);
  check("bell shows 3", await bellIs(a, "Notifications, 3 unread"), await bell(a));
  await a.click("button", "Mark all");
  check("Mark all read in the inbox clears the bell", await bellIs(a, "Notifications"), await bell(a));
  check("…and the other tab", await bellIs(b, "Notifications"), await bell(b));

  // 4. The bell's "Mark all read" while the inbox is open: the inbox shows them read too.
  await message("Read test six");
  await message("Read test seven");
  await a.go("/notifications", 3000);
  check("inbox lists 2 unread", /Unread\s*2/i.test(await a.text()));
  await openBell(a);
  await a.click("[role=menu] button", "Mark all read");
  check("the bell's Mark all read updates the open inbox", await until(async () => /all caught up/i.test(await a.text())));

  // 5. Reading in one tab takes the other tab's pop-up away (checked with B in front).
  await b.front();
  await b.go("/leads", 2500);
  const eight = await message("Read test eight");
  check("pop-up shows in tab B", await until(async () => /Read test eight/.test(await b.toasts())));
  await a.front();
  await a.go(`/notifications/${eight}`, 3000);
  await b.front();
  check("reading it in tab A removes tab B's pop-up", await until(async () => !/Read test eight/.test(await b.toasts()), { timeout: 4000 }), await b.toasts());
  check("…and tab B's count", await bellIs(b, "Notifications"), await bell(b));
} finally {
  clear();
  browser.close();
}

finish("notification read");
