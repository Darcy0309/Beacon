/**
 * Signed in as an account that is deleted since (Sean, Nov 2026: a test client deleted while he was still signed in
 * as it: "Something went wrong" on every page, and he couldn't get out). The workspace says the account couldn't be
 * loaded, with Sign out, instead of an error page; signing out reaches the sign-in page, and another account signs in.
 *
 *   node tests/run.mjs tests/e2e/account-missing.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { PASSWORD } from "../support/env.mjs";

const CLIENT = Number(sql(`select id from public.users where email = 'client@beacon.test'`));
const browser = await launchBrowser();
try {
  const p = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1300, height: 900 });
  await p.go("/", 6000);
  check("signed in as the client", Boolean(await until(() => p.ev("!!document.querySelector('[data-my-profile-link]')"), { timeout: 20000 })));

  section("Its account deleted while signed in");
  sql(`update public.users set deleted_at = now() where id = ${CLIENT}`);
  await p.go("/calendar", 6000);
  const shown = await until(() => p.ev("document.querySelector('[data-account-missing]')?.innerText ?? null"), { timeout: 20000 });
  check("the account couldn't be loaded, said plainly, not an error page", /couldn.t load your account/i.test(shown ?? "")
    && !(await p.ev("document.body.innerText.includes('Something went wrong')")), shown);

  section("Signed out, and another account in");
  await p.click("[data-account-missing-sign-out]");
  check("Sign out reaches the sign-in page", Boolean(await until(async () => (await p.path()) === "/login", { timeout: 15000 })), await p.path());
  await until(() => p.ev("!!document.querySelector('input[name=\"email\"]')"), { timeout: 15000 });
  await sleep(2500);
  await p.fill('input[name="email"]', "admin@beacon.test");
  await p.fill('input[name="password"]', PASSWORD);
  await p.click("button[type=submit]");
  const who = await until(() => p.ev("document.querySelector('[data-my-profile-link]')?.innerText.replace(/\\s+/g, ' ') ?? null"), { timeout: 20000 });
  check("…and the administrator signs in as themselves", /Administrator/.test(who ?? ""), `${who} at ${await p.path()}`);
  await sleep(200);
} finally {
  browser.close();
  sql(`update public.users set deleted_at = null where id = ${CLIENT}`);
}

finish("account missing");
