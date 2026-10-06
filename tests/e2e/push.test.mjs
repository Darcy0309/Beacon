/**
 * Push notifications, with the app and a real browser:
 *   - a new notification asks the app to push it (the database's trigger,
 *     through pg_net), once, and only with the shared secret;
 *   - the browser's worker (public/sw.js) shows a push on the desktop when
 *     nobody is looking at Lighthouse, even with every tab closed, and not
 *     while someone is; reading it in Lighthouse takes it down; clicking
 *     it opens the notification;
 *   - turning desktop notifications on saves this browser for the person,
 *     and turning them off or signing out forgets it.
 *
 * Headless Chrome has no push service, so pushes are handed to the worker
 * through DevTools, and the subscribing step uses a stand-in subscription.
 * The push itself (encrypted, VAPID-signed, to a push service) was checked
 * against a local push service by hand.
 *
 * Needs the app started with VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
 * PUSH_DELIVER_SECRET, and the local database's Vault holding
 * push_deliver_url (the app's /api/push/deliver, as the database container
 * reaches it) and the same push_deliver_secret.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { APP_URL } from "../support/env.mjs";

const RUN = Date.now();
const AGENT = Number(sql("select id from public.users where email='agent@beacon.test'"));
const SECRET = sql("select coalesce((select decrypted_secret from vault.decrypted_secrets where name='push_deliver_secret'), '')");
// What an interrupted run left behind would show in other tests' conversations.
sql("delete from public.notifications where title like 'Push e2e %'");
const manager = await signIn("sean@beacon.test");
let n = 0;
async function notify() {
  n += 1;
  const title = `Push e2e ${RUN} #${n}`;
  const { error } = await manager.sb.rpc("send_notification", { p_user_ids: [AGENT], p_roles: [], p_title: title, p_body: "Call Acme back", p_link: null });
  if (error) throw error;
  return { title, id: Number(sql(`select id from public.notifications where user_id=${AGENT} and title=${lit(title)}`)) };
}
const deliver = (ids, secret = SECRET) =>
  fetch(`${APP_URL}/api/push/deliver`, { method: "POST", headers: { "content-type": "application/json", "x-push-secret": secret }, body: JSON.stringify({ ids }) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

// Headless Chrome cannot subscribe to a push service: a stand-in subscription,
// kept in localStorage, with the key it was made with.
const STUB = `(() => { if (!window.PushManager) return; const K = 'lighthouse-test-push';
  const make = ({ endpoint, key }) => ({ endpoint, options: { applicationServerKey: Uint8Array.from(atob(key), (c) => c.charCodeAt(0)).buffer },
    toJSON: () => ({ endpoint, keys: { p256dh: 'BOrN3x8vS1ttzOq3aKz1q9Lw2nYc5uTg0pXQm7dE4fVhJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ0', auth: 'k3x9Qw2Lp8Rt5Yv1' } }),
    unsubscribe: async () => { localStorage.removeItem(K); return true; } });
  PushManager.prototype.getSubscription = async function () { const s = localStorage.getItem(K); return s ? make(JSON.parse(s)) : null; };
  PushManager.prototype.subscribe = async function ({ applicationServerKey }) {
    const s = { endpoint: 'https://fcm.googleapis.com/fcm/send/lighthouse-test-${RUN}', key: btoa(String.fromCharCode(...new Uint8Array(applicationServerKey))) };
    localStorage.setItem(K, JSON.stringify(s)); return make(s); };
})()`;

const browser = await launchBrowser();
const ctx = await browser.newContext({ as: "agent@beacon.test" });
const grant = async (p) => {
  const { targetInfo } = await p.send("Target.getTargetInfo");
  await p.send("Browser.setPermission", { permission: { name: "notifications" }, setting: "granted", origin: APP_URL, browserContextId: targetInfo.browserContextId });
};
const front = async (p) => {
  await p.send("Page.bringToFront");
  await sleep(400);
};
/** Hand the worker a push, as a push service would. */
async function push(p, payload) {
  await p.send("ServiceWorker.enable");
  for (let id = 0; id < 10; id++) {
    try {
      await p.send("ServiceWorker.deliverPushMessage", { origin: new URL(APP_URL).origin, registrationId: String(id), data: JSON.stringify(payload) });
      return true;
    } catch {
      /* not this registration */
    }
  }
  return false;
}
/** Close a tab; Chrome may close it before it answers, so do not wait long for the answer. */
const closeTab = async (p) => {
  await Promise.race([p.send("Page.close").catch(() => {}), sleep(1500)]);
  p.close();
};
const desktop = (p) => p.ev(`(async () => { const r = await navigator.serviceWorker.getRegistration('/');
  return r ? (await r.getNotifications()).map((x) => ({ title: x.title, tag: x.tag, body: x.body })) : []; })()`);
const payloadOf = (m) => ({ id: m.id, title: m.title, body: "From Sean Fitzgerald\nCall Acme back", url: `/notifications/${m.id}` });
const saved = () => sql(`select count(*) from public.push_subscriptions where user_id=${AGENT} and endpoint like ${lit(`%lighthouse-test-${RUN}`)}`);

try {
  section("A new notification asks the app to push it");
  check("the local database is set up to push (Vault holds the app's address and secret)", Boolean(SECRET));
  let m = await notify();
  check("the database asks, and the app takes it", Boolean(await until(() => sql(`select pushed_at is not null from public.notifications where id=${m.id}`) === "t", { timeout: 10000 })));
  const again = await deliver([m.id]);
  check("asked again, it is not pushed twice", again.status === 200 && again.body?.notifications === 0, JSON.stringify(again));
  const forged = await deliver([m.id], "not-the-secret");
  check("without the secret, the app refuses", forged.status === 401, JSON.stringify(forged));

  section("The worker, with Lighthouse open");
  const a = await ctx.newPage();
  const elsewhere = await ctx.newPage();
  await elsewhere.send("Page.navigate", { url: "about:blank" });
  // Granted from the tab that stays open: Chrome drops a grant made over
  // DevTools when the tab that made it closes.
  await grant(elsewhere);
  await front(a);
  await a.go("/leads", 5000);
  check("Lighthouse installs its worker", Boolean(await until(() => a.ev(`navigator.serviceWorker.getRegistration('/').then((r) => Boolean(r?.active))`))));
  m = await notify();
  await push(a, payloadOf(m));
  await sleep(800);
  check("someone looking at Lighthouse: no desktop pop-up from the worker", !(await desktop(a)).some((x) => x.title === m.title));
  await front(elsewhere);
  m = await notify();
  await push(a, payloadOf(m));
  const shown = await until(async () => (await desktop(a)).find((x) => x.title === m.title));
  check("nobody looking: the worker shows it", Boolean(shown));
  check("…with who sent it, what it says, and its tag", shown?.body === "From Sean Fitzgerald\nCall Acme back" && shown?.tag === `lighthouse-notification-${m.id}`, JSON.stringify(shown));
  sql(`update public.notifications set read_at = now() where id = ${m.id}`); // read somewhere else
  check("read somewhere else, Lighthouse takes it down", Boolean(await until(async () => !(await desktop(a)).some((x) => x.title === m.title), { timeout: 8000 })));
  // A click on it: the worker focuses Lighthouse and asks it to open the notification.
  await a.ev(`navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'lighthouse:open', url: ${JSON.stringify(`${APP_URL}/notifications/${m.id}`)} } }))`);
  check("clicked, Lighthouse opens the notification", Boolean(await until(async () => (await a.path()) === `/notifications/${m.id}`)));
  await a.ev(`navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'lighthouse:open', url: 'https://evil.example/phish' } }))`);
  await sleep(500);
  check("…and never a page somewhere else", (await a.path()) === `/notifications/${m.id}`);

  section("With every Lighthouse tab closed");
  await closeTab(a);
  await sleep(800);
  m = await notify();
  check("the push still reaches the worker", await push(elsewhere, payloadOf(m)));
  const later = await ctx.newPage();
  await later.go("/leads", 1500);
  await front(elsewhere);
  check("…and it shows on the desktop", Boolean(await until(async () => (await desktop(later)).some((x) => x.title === m.title))));
  await closeTab(later);

  section("Turning them on saves this browser");
  const b = await ctx.newPage();
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });
  await front(b);
  await b.go("/leads", 5000);
  check("on: this browser is saved for the person", Boolean(await until(() => saved() === "1", { timeout: 10000 })));
  await b.click('button[aria-label^="Notifications"]');
  const says = await until(() => b.ev(`document.querySelector('[data-desktop-switch][data-push="on"]')?.innerText ?? null`));
  check("…and the bell says they come even when Lighthouse is closed", /even when Lighthouse is closed/.test(says ?? ""), says);
  await b.click("[data-desktop-switch] button", "Turn off");
  check("Turn off: the browser is forgotten", Boolean(await until(() => saved() === "0")));
  await b.click("[data-desktop-switch] button", "Turn on");
  check("Turn on: saved again", Boolean(await until(() => saved() === "1")));
  await b.key("Escape");
  await b.ev(`document.querySelector('form button[aria-label="Sign out"]')?.click()`);
  check("signing out forgets it, so the next person here does not get this person's", Boolean(await until(() => saved() === "0", { timeout: 10000 })));
  check("…and signs out", Boolean(await until(async () => (await b.path()) === "/login", { timeout: 10000 })));
} finally {
  browser.close();
  sql(`delete from public.push_subscriptions where endpoint like ${lit(`%lighthouse-test-${RUN}`)}`);
  sql(`delete from public.notifications where title like ${lit(`Push e2e ${RUN}%`)}`);
}

finish("push");
