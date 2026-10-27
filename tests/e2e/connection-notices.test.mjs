/**
 * Every error a notice (Oct 2026), in a real browser: the connection lost is
 * said (and kept up) and found again; a button whose call to the server
 * doesn't get there says so instead of doing nothing; a call that failed with
 * nothing on the page to catch it is said all the same.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { launchBrowser } from "../support/browser.mjs";

const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });
const toastSays = (page, re) => when(page, `[...document.querySelectorAll('[data-sonner-toast]')].some((t) => ${re}.test(t.textContent))`);
const setValue = (page, sel, value) => page.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
try {
  const page = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await page.go("/list-builder/new", 8000);
  await when(page, "!!document.querySelector('[data-radius-zip]')", 30000);
  await page.send("Network.enable");

  section("Offline, and back");
  await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check("losing the connection is said", Boolean(await toastSays(page, "/You're offline/")));
  await setValue(page, "[data-radius-miles]", "5");
  await setValue(page, "[data-radius-zip]", "85201");
  await page.ev("document.querySelector('[data-radius-find]').click()");
  check("a button whose call doesn't get there says so", Boolean(await toastSays(page, "/Couldn't reach Lighthouse/")));
  check("…and the page is still there", await page.ev("!!document.querySelector('[data-radius-zip]')"));
  await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check("coming back is said", Boolean(await toastSays(page, "/Back online/")));

  section("A failure nothing on the page caught");
  await page.ev("setTimeout(() => Promise.reject(Object.assign(new Error('boom'), { digest: '12345' })), 0), true");
  check("a server error is said, with its reference", Boolean(await toastSays(page, "/Something went wrong[\\s\\S]*12345/")));
} finally {
  browser.close();
}

finish("connection notices");
