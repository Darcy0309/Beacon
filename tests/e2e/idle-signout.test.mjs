/**
 * Signing out after 30 minutes without activity (Sean, Oct 2026), end to
 * end, with the clock moved rather than waited for: a manager is warned two
 * minutes before, Stay signed in carries on, and with no answer they are
 * signed out and told why; a session left behind (a laptop closed, a
 * browser reopened) is ended by the server too; administrators have no
 * limit.
 *
 *   node tests/e2e/idle-signout.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { launchBrowser } from "../support/browser.mjs";

const KEY = "lighthouse-last-activity";
const minutesAgo = (m) => Date.now() - m * 60_000;
const browser = await launchBrowser();
const idleCookie = async (page) => (await page.send("Network.getCookies", { urls: ["http://localhost:3000/"] })).cookies.find((c) => c.name === "lh_idle");

try {
  section("A manager left idle");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1280, height: 900 });
  await sean.go("/", 4000);
  const cookie = await until(() => idleCookie(sean));
  check("using Lighthouse keeps the server's clock for this session", Boolean(cookie?.httpOnly) && /^\d+\..+/.test(cookie?.value ?? ""), cookie?.value);

  await sean.ev(`localStorage.setItem(${JSON.stringify(KEY)}, ${minutesAgo(28.5)})`);
  check("two minutes before the end: Still there?, with a countdown",
    Boolean(await until(async () => /Still there/.test((await sean.ev(`document.querySelector('[data-idle-warning]')?.innerText ?? ''`)) ?? ""))),
    await sean.ev(`document.querySelector('[data-idle-countdown]')?.textContent ?? ''`));
  check("…the countdown under two minutes", /^[01]:\d\d$/.test(await sean.ev(`document.querySelector('[data-idle-countdown]')?.textContent ?? ''`)));
  await sean.click("[data-idle-stay]");
  check("Stay signed in carries on", Boolean(await until(async () => !(await sean.ev(`!!document.querySelector('[data-idle-warning]')`)))) && (await sean.path()) === "/");

  await sean.ev(`localStorage.setItem(${JSON.stringify(KEY)}, ${minutesAgo(31)})`);
  check("with no answer, signed out at 30 minutes, and told why",
    Boolean(await until(async () => (await sean.path()) === "/login" && /signed out after 30 minutes without activity/i.test(await sean.text()), { timeout: 10000 })), await sean.url());
  await sean.go("/work", 3000);
  check("…the session is over: the workspace asks to sign in", (await sean.path()) === "/login", await sean.url());

  section("A session left behind");
  const again = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1280, height: 900 });
  await again.go("/", 4000);
  const fresh = await until(() => idleCookie(again));
  const sid = fresh.value.split(".").slice(1).join(".");
  // As if the laptop was closed 40 minutes ago, before the browser could sign them out.
  await again.send("Network.setCookie", { ...fresh, value: `${minutesAgo(40)}.${sid}`, url: "http://localhost:3000/" });
  await again.ev(`localStorage.setItem(${JSON.stringify(KEY)}, ${minutesAgo(1)})`);
  await again.go("/work", 3000);
  check("the server ends it on the next page, and says why", (await again.path()) === "/login" && /without activity/i.test(await again.text()), await again.url());
  check("…bringing them back where they were once they sign in", /next=%2Fwork/.test(await again.url()), await again.url());

  section("Administrators");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1280, height: 900 });
  await admin.go("/", 4000);
  await admin.ev(`localStorage.setItem(${JSON.stringify(KEY)}, ${minutesAgo(45)})`);
  await sleep(2500);
  check("no limit: nothing counts down, and they stay signed in", (await admin.path()) === "/" && !(await admin.ev(`!!document.querySelector('[data-idle-warning]')`)) && !(await idleCookie(admin)));
} finally {
  browser.close();
}

finish("idle sign-out");
