/**
 * Desktop notifications, in a real browser: the system's own pop-up for a
 * new notification while nobody is looking at Lighthouse (another tab or
 * app in front), never while someone is; once however many Lighthouse tabs
 * are open; clicking it opens the notification; reading it anywhere takes
 * it down; the switch in the bell turns them on, off and tests them, and
 * says so when the browser blocks them.
 *
 * The page's Notification is wrapped so the test can see each one the app
 * shows (the real one is still shown too).
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { APP_URL } from "../support/env.mjs";

const AGENT = Number(sql("select id from public.users where email='agent@beacon.test'"));
const TAG = `Desktop test ${Date.now()}`;
const clear = () => sql(`delete from public.notifications where title like ${lit(`${TAG}%`)}`);
sql(`update public.notifications set read_at = coalesce(read_at, now()) where user_id=${AGENT}`);

const manager = await signIn("sean@beacon.test");
let n = 0;
async function notify() {
  n += 1;
  const title = `${TAG} #${n}`;
  const { error } = await manager.sb.rpc("send_notification", { p_user_ids: [AGENT], p_roles: [], p_title: title, p_body: "Please work the Capital list today", p_link: null });
  if (error) throw error;
  return { title, id: Number(sql(`select id from public.notifications where user_id=${AGENT} and title=${lit(title)}`)) };
}

// Every Notification the page creates, kept in window.__desktop (and still shown for real).
const SPY = `(() => { const Real = window.Notification; if (!Real) return; window.__desktop = []; window.__desktopObjs = [];
  class Spy { constructor(title, options = {}) { this.i = window.__desktop.length; window.__desktop.push({ title, body: options.body, tag: options.tag, icon: options.icon, closed: false });
      window.__desktopObjs.push(this); try { this.real = new Real(title, options); } catch {} }
    close() { window.__desktop[this.i].closed = true; this.real?.close(); }
    static get permission() { return Real.permission; }
    static requestPermission(...a) { return Real.requestPermission(...a); } }
  window.Notification = Spy; })()`;

const browser = await launchBrowser({ mouse: true });
const ctx = await browser.newContext({ as: "agent@beacon.test" });
const tab = async () => {
  const p = await ctx.newPage();
  await p.send("Page.addScriptToEvaluateOnNewDocument", { source: SPY });
  return p;
};
const permission = async (p, setting) => {
  const { targetInfo } = await p.send("Target.getTargetInfo");
  await p.send("Browser.setPermission", { permission: { name: "notifications" }, setting, origin: APP_URL, browserContextId: targetInfo.browserContextId });
};
const shown = (p) => p.ev("window.__desktop ?? []");
const front = async (p) => {
  await p.send("Page.bringToFront");
  await sleep(400);
};
const BELL = 'button[aria-label^="Notifications"]';
const switchState = (p) => p.ev(`document.querySelector('[data-notification-panel] [data-desktop-switch]')?.dataset.desktopSwitch ?? null`);
const openBell = async (p) => {
  if (!(await p.ev(`!!document.querySelector('[data-notification-panel]')`))) await p.click(BELL);
  return until(() => switchState(p));
};
const switchButton = (p, text) => p.click("[data-notification-panel] [data-desktop-switch] button", text);

try {
  const a = await tab();
  const elsewhere = await ctx.newPage(); // another tab, not Lighthouse: someone working in something else
  await elsewhere.send("Page.navigate", { url: "about:blank" });
  await front(a);
  await a.go("/leads", 4000);

  section("The switch");
  check("before the browser is asked, the bell offers to turn them on", (await openBell(a)) === "ask",
    await a.ev(`document.querySelector('[data-desktop-switch]')?.innerText`));
  await permission(a, "granted"); // what clicking Allow in the browser's prompt does
  check("once the browser allows them, the switch says they are on, by itself", Boolean(await until(async () => (await switchState(a)) === "on")));
  const tests = async () => (await shown(a)).filter((x) => x.title === "Desktop notifications are on").length;
  await switchButton(a, "Test");
  check("Test shows a pop-up on the desktop", Boolean(await until(async () => (await tests()) === 1)), JSON.stringify(await shown(a)));
  await switchButton(a, "Turn off");
  check("Turn off: off", Boolean(await until(async () => (await switchState(a)) === "off")));
  await switchButton(a, "Turn on");
  check("Turn on: on, with a test pop-up to show it works", Boolean(await until(async () => (await switchState(a)) === "on" && (await tests()) === 2)));
  await a.key("Escape");
  check("the inbox page has the same switch", await (async () => {
    const inbox = await tab();
    await inbox.go("/notifications", 4000);
    const s = await inbox.ev(`document.querySelector('[data-desktop-switch]')?.dataset.desktopSwitch`);
    await inbox.send("Page.close").catch(() => {});
    inbox.close();
    return s === "on";
  })());
  await front(a);
  const before = (await shown(a)).length;

  section("While someone is looking at Lighthouse");
  let m = await notify();
  check("the in-app pop-up shows", Boolean(await a.waitToast(new RegExp(m.title), 8000)));
  check("…and no desktop pop-up", (await shown(a)).length === before, JSON.stringify(await shown(a)));

  section("While they are in another tab or app");
  await front(elsewhere);
  m = await notify();
  const popped = await until(async () => (await shown(a)).find((x) => x.title === m.title), { timeout: 10000 });
  check("a desktop pop-up shows", Boolean(popped));
  check("…with who sent it and what it says", popped?.body === "From Sean Fitzgerald\nPlease work the Capital list today", popped?.body);
  check("…tagged with the notification, and the Lighthouse icon", popped?.tag === `lighthouse-notification-${m.id}` && popped?.icon === "/notification-icon.png", JSON.stringify(popped));
  // Clicking it brings Lighthouse back and opens the notification.
  await a.ev(`window.__desktopObjs.find((o) => window.__desktop[o.i].title === ${JSON.stringify(m.title)}).onclick()`);
  check("clicking it opens the notification", Boolean(await until(async () => (await a.path()) === `/notifications/${m.id}`, { timeout: 8000 })), await a.path());
  check("…marks it read", Boolean(await until(() => sql(`select read_at is not null from public.notifications where id=${m.id}`) === "t")));
  check("…and takes the pop-up down", (await shown(a)).find((x) => x.title === m.title)?.closed === true);

  section("Read somewhere else");
  await a.go("/leads", 4000);
  await front(elsewhere);
  m = await notify();
  await until(async () => (await shown(a)).some((x) => x.title === m.title), { timeout: 10000 });
  sql(`update public.notifications set read_at = now() where id = ${m.id}`); // read on another device
  check("its desktop pop-up comes down", Boolean(await until(async () => (await shown(a)).find((x) => x.title === m.title)?.closed, { timeout: 8000 })));

  section("Several Lighthouse tabs");
  const b = await tab();
  await b.go("/leads", 4000);
  await front(elsewhere);
  m = await notify();
  const both = await until(async () => {
    const [x, y] = [(await shown(a)).find((s) => s.title === m.title), (await shown(b)).find((s) => s.title === m.title)];
    return x && y ? [x, y] : null;
  }, { timeout: 10000 });
  check("with none in front, each tab's pop-up carries the same tag, so the desktop shows it once", Boolean(both) && both[0].tag === both[1].tag, JSON.stringify(both));
  await front(b);
  m = await notify();
  check("with one in front, it has the in-app pop-up", Boolean(await b.waitToast(new RegExp(m.title), 8000)));
  await sleep(1500);
  check("…and no tab shows a desktop one", !(await shown(a)).some((x) => x.title === m.title) && !(await shown(b)).some((x) => x.title === m.title));

  section("Turned off");
  await front(a);
  await openBell(a);
  await switchButton(a, "Turn off");
  check("Turn off: it says they are off", Boolean(await until(async () => (await switchState(a)) === "off")));
  check("…in the other tab too", Boolean(await until(async () => (await openBell(b)) === "off")));
  await a.key("Escape");
  await b.key("Escape");
  await front(elsewhere);
  m = await notify();
  await sleep(2500);
  check("…and nothing pops up on the desktop", !(await shown(a)).some((x) => x.title === m.title) && !(await shown(b)).some((x) => x.title === m.title));
  await front(a);
  await openBell(a);
  await switchButton(a, "Turn on");
  check("Turn on again: back on", Boolean(await until(async () => (await switchState(a)) === "on")));

  section("Blocked by the browser");
  await permission(a, "denied");
  await a.go("/leads", 4000);
  check("the switch says the browser is blocking them, and how to allow them", (await openBell(a)) === "blocked"
    && /blocking desktop notifications[\s\S]*Allow/.test(await a.ev(`document.querySelector('[data-desktop-switch]').innerText`)));
} finally {
  browser.close();
  clear();
}

finish("desktop notifications");
