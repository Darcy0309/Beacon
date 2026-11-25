/**
 * A session Supabase has ended (Sean, Nov 2026: signed out elsewhere, his password reset, his login made again:
 * "Invalid Refresh Token: Refresh Token Not Found" on every request, and no way back in): its cookies are taken off,
 * the browser goes to the sign-in page, which loads without the dead session being tried again, and signing in works.
 *
 *   node tests/run.mjs tests/e2e/dead-session.test.mjs
 */
import { readFileSync } from "node:fs";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { PASSWORD } from "../support/env.mjs";

const LOG = process.env.DEV_LOG;
const refreshErrors = () => (LOG ? (readFileSync(LOG, "utf8").match(/refresh_token_not_found/g) ?? []).length : 0);
const AUTH = sql(`select auth_id from public.users where email = 'admin@beacon.test'`);

const browser = await launchBrowser();
try {
  const p = await (await browser.newContext()).newPage({ width: 1300, height: 900 });
  const signIn = async () => {
    await p.go("/login", 5000);
    await until(() => p.ev("!!document.querySelector('input[name=email]')"), { timeout: 15000 });
    await sleep(1500);
    await p.fill('input[name="email"]', "admin@beacon.test");
    await p.fill('input[name="password"]', PASSWORD);
    await p.click("button[type=submit]");
    return until(() => p.ev("document.querySelector('[data-my-profile-link]')?.innerText ?? null"), { timeout: 20000 });
  };
  check("signed in", Boolean(await signIn()));
  const cookies = async () => (await p.send("Network.getAllCookies")).cookies.filter((c) => c.name.includes("auth-token")).length;
  check("…with a session cookie", (await cookies()) > 0);

  section("The session ended elsewhere");
  sql(`delete from auth.sessions where user_id = '${AUTH}'`);
  // An expired access token, so the next request has to renew it with the (now dead) refresh token.
  await p.send("Network.getAllCookies").then(async ({ cookies: all }) => {
    for (const c of all.filter((x) => x.name.includes("auth-token"))) {
      let v = c.value;
      try {
        const raw = v.startsWith("base64-") ? Buffer.from(v.slice(7), "base64").toString() : decodeURIComponent(v);
        const s = JSON.parse(raw); s.expires_at = 1; s.access_token = s.access_token;
        v = `base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
      } catch { /* a chunk: leave it */ }
      await p.send("Network.setCookie", { name: c.name, value: v, domain: c.domain, path: c.path, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite });
    }
  });
  const before = refreshErrors();
  await p.go("/calendar", 6000);
  check("a page: the sign-in page, not an error", Boolean(await until(async () => (await p.path()) === "/login", { timeout: 15000 })), await p.path());
  check("…its session cookies taken off", (await cookies()) === 0, String(await cookies()));
  // Found dead once (the library says so twice), and never tried again: the sign-in page loads clean.
  const once = refreshErrors();
  await p.go("/login", 4000);
  await p.go("/login", 4000);
  check("…and the dead session not tried again on the sign-in page", !LOG || refreshErrors() === once, `${refreshErrors() - once} more refresh errors (${once - before} the once)`);

  section("Signing in again");
  check("works", /Administrator/.test((await signIn()) ?? ""));
} finally {
  browser.close();
}

finish("dead session");
