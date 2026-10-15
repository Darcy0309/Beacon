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
import { sql } from "../support/db.mjs";

const KEY = "lighthouse-last-activity";
const minutesAgo = (m) => Date.now() - m * 60_000;
const browser = await launchBrowser();
// The security setting as it was, put back after.
const securityBefore = sql("select coalesce((select value::text from public.app_settings where key = 'security'), '')");
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

  section("Each role's time, set in Settings");
  await admin.go("/settings", 5000);
  await until(() => admin.ev(`!!document.querySelector('[data-idle-settings] select[name="manager"]')`));
  await admin.fill('[data-idle-settings] select[name="manager"]', "60");
  await admin.fill('[data-idle-settings] select[name="agent"]', "0");
  await admin.click("[data-idle-settings] button[type=submit]");
  check("an administrator sets an hour for account managers, never for agents",
    Boolean(await until(() => sql("select value->'idle_minutes'->>'manager' || '|' || (value->'idle_minutes'->>'agent') from public.app_settings where key = 'security'") === "60|0")));
  const hour = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1280, height: 900 });
  await hour.go("/", 4000);
  check("the server keeps the manager's hour with the session", /^\d+\.60\./.test((await until(() => idleCookie(hour)))?.value ?? ""), (await idleCookie(hour))?.value);
  await hour.ev(`localStorage.setItem(${JSON.stringify(KEY)}, ${minutesAgo(31)})`);
  await sleep(2500);
  check("…so 31 minutes untouched is not the end", (await hour.path()) === "/" && !(await hour.ev(`!!document.querySelector('[data-idle-warning]')`)));
  await hour.ev(`localStorage.setItem(${JSON.stringify(KEY)}, ${minutesAgo(58.5)})`);
  check("…the warning comes before the hour, saying so",
    Boolean(await until(async () => /signed out after 1 hour without activity/.test((await hour.ev(`document.querySelector('[data-idle-warning]')?.innerText ?? ''`)) ?? ""))));
  await hour.click("[data-idle-stay]");

  section("On the phone");
  await hour.ev(`localStorage.setItem(${JSON.stringify(KEY)}, ${minutesAgo(20)})`);
  await hour.ev(`window.dispatchEvent(new CustomEvent('lighthouse:phone'))`);
  await hour.click("[data-phone-test-call]");
  await until(() => hour.ev(`!!document.querySelector('[data-phone-answer]')`), { timeout: 9000 });
  await hour.click("[data-phone-answer]");
  check("a call on the phone counts as activity", Boolean(await until(() => hour.ev(`Date.now() - Number(localStorage.getItem(${JSON.stringify(KEY)})) < 10000`))));
  await hour.click("[data-phone-end]");

  section("Never");
  const agent = await (await browser.newContext({ as: "agent@beacon.test" })).newPage({ width: 1280, height: 900 });
  await agent.go("/", 4000);
  await sleep(1500);
  await agent.ev(`localStorage.setItem(${JSON.stringify(KEY)}, ${minutesAgo(45)})`);
  await sleep(2500);
  check("agents, set to never: nothing counts down, no clock kept", (await agent.path()) === "/" && !(await agent.ev(`!!document.querySelector('[data-idle-warning]')`)) && !(await idleCookie(agent)));
} finally {
  browser.close();
  if (securityBefore) sql(`update public.app_settings set value = '${securityBefore.replace(/'/g, "''")}'::jsonb where key = 'security'`);
}

finish("idle sign-out");
