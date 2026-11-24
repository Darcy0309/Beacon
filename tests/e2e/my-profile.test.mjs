/**
 * My Profile (Nov 2026): the sidebar's picture and name open it (no menu item); who you are at a glance; your details, photo and
 * voicemail greeting (from My Security); this computer's preferences; and the sign-in a click from My Security, which
 * keeps the password and two-factor. A client sees theirs without the staff parts.
 *
 *   node tests/run.mjs tests/e2e/my-profile.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SEAN = sql("select first_name || ' ' || last_name from public.users where email = 'sean@beacon.test'");
const mobileBefore = sql("select coalesce(mobile, '') from public.users where email = 'sean@beacon.test'");
const browser = await launchBrowser();
try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go("/", 8000);

  section("From the sidebar");
  check("the sidebar's picture and name open My Profile", await until(() => sean.ev(`!!document.querySelector('[data-my-profile-link]')`)) && (await sean.ev(`document.querySelector('[data-my-profile-link]').getAttribute('href')`)) === "/profile");
  await sean.click("[data-my-profile-link]");
  check("…which opens", Boolean(await until(async () => (await sean.path()) === "/profile" && sean.ev(`!!document.querySelector('[data-my-profile]')`), { timeout: 20000 })));
  check("…from the avatar only, not a menu item", !(await sean.ev(`[...document.querySelectorAll('nav a')].some((a) => a.getAttribute('href') === '/profile')`)));

  section("What it has");
  const header = await sean.ev(`document.querySelector('[data-profile-header]')?.innerText ?? ''`);
  check("who you are: your name, role and email", header.includes(SEAN) && /Account Manager/.test(header) && header.includes("sean@beacon.test"), header.slice(0, 200));
  check("your details and voicemail greeting; your photo from your avatar, no My Photo box", await sean.ev(`!!document.querySelector('[data-profile-form]') && !!document.querySelector('[data-profile-avatar] [data-choose-picture]') && !document.querySelector('[data-my-photo]') && !!document.querySelector('[data-my-voicemail]')`));
  check("this computer's preferences: appearance, desktop notifications, time zone", await sean.ev(`!!document.querySelector('[data-profile-preferences] [data-open-appearance]') && !!document.querySelector('[data-profile-desktop]') && !!document.querySelector('[data-profile-tz]')`));
  await sean.click("[data-profile-preferences] [data-open-appearance]");
  check("…Appearance opens", Boolean(await until(() => sean.ev(`!!document.querySelector('[role=dialog]')`))));
  await sean.key("Escape");

  section("Saved from here");
  await sean.fill('[data-profile-form] input[name="mobile"]', "(602) 555-0177");
  await sean.click("[data-profile-form] button[type=submit]");
  check("your details save", Boolean(await until(() => /6025550177|602\) 555-0177/.test(sql("select coalesce(mobile, '') from public.users where email = 'sean@beacon.test'")) || null, { timeout: 10000 })));

  section("My Security: the sign-in");
  await sean.click("[data-profile-to-security]");
  await until(async () => (await sean.path()) === "/security");
  check("password and two-factor stay there; your details are a link to My Profile",
    Boolean(await until(() => sean.ev(`!!document.querySelector('[data-security-to-profile] a[href="/profile"]') && !document.querySelector('[data-profile-form]') && /Two-Factor/i.test(document.body.innerText)`))));

  section("A client");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await client.go("/profile", 8000);
  check("their profile, without a staff photo or voicemail", Boolean(await until(() => client.ev(`!!document.querySelector('[data-profile-form]') && !document.querySelector('[data-profile-avatar]') && !document.querySelector('[data-my-voicemail]')`), { timeout: 20000 })));
} finally {
  browser.close();
  sql(`update public.users set mobile = ${mobileBefore ? `'${mobileBefore.replace(/'/g, "''")}'` : "null"} where email = 'sean@beacon.test'`);
}

finish("my profile");
