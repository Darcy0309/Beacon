/**
 * Signing in to a disabled account (Nov 2026): with the right password, a notice that the
 * account is disabled, not the wrong-password alert; with a wrong one, or an email with no
 * account, still "don't match", so it never tells which emails have accounts. The password
 * check is the server's alone.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn, adminClient } from "../support/auth.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { PASSWORD } from "../support/env.mjs";

const SHOTS = process.env.SHOTS;
const EMAIL = "agent@beacon.test";
const admin = adminClient();
const authId = sql(`select auth_id from public.users where email = '${EMAIL}'`);
const browser = await launchBrowser({ mouse: true });

const attempt = async (email, password, shot) => {
  const page = await (await browser.newContext()).newPage({ width: 1200, height: 900 });
  await page.go("/login", 4000);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click("button[type=submit]", "Sign in");
  let seen = null;
  for (let i = 0; i < 40 && !seen; i++) {
    seen = await page.ev(`(() => { const n = document.querySelector('[data-account-disabled]'); const a = [...document.querySelectorAll('form [role=alert]')].map((e) => e.innerText).join(' ');
      return n ? { notice: n.innerText } : a ? { alert: a } : null; })()`);
    if (!seen) await new Promise((r) => setTimeout(r, 250));
  }
  if (SHOTS && shot) await page.screenshot(`${SHOTS}/${shot}.png`);
  return seen ?? {};
};

try {
  // Disabled as the Users page disables someone: the status, and the sign-in banned.
  sql(`update public.users set status = 'disabled' where email = '${EMAIL}'`);
  await admin.auth.admin.updateUserById(authId, { ban_duration: "876600h" });

  section("A disabled account");
  const right = await attempt(EMAIL, PASSWORD, "disabled-sign-in");
  check("the right password: a notice that the account is disabled", /Your account is disabled/.test(right.notice ?? "") && /administrator/.test(right.notice ?? ""), JSON.stringify(right));
  check("…not the wrong-password alert", !/don't match/.test(right.notice ?? "") && !right.alert, JSON.stringify(right));
  const wrong = await attempt(EMAIL, "not-the-password-123", "disabled-wrong-password");
  check("a wrong password: still \"don't match\", nothing about the account", /don't match an active account/.test(wrong.alert ?? "") && !wrong.notice, JSON.stringify(wrong));
  const nobody = await attempt("nobody-here@beacon.test", PASSWORD);
  check("an email with no account: \"don't match\"", /don't match an active account/.test(nobody.alert ?? "") && !nobody.notice, JSON.stringify(nobody));

  section("The password check, the server's alone");
  const someone = await signIn("admin@beacon.test");
  const tried = await someone.sb.rpc("disabled_account_password", { p_email: EMAIL, p_password: PASSWORD });
  check("not for a signed-in user, even an administrator", Boolean(tried.error), JSON.stringify(tried));
  check("…which the server gets right", (await admin.rpc("disabled_account_password", { p_email: EMAIL, p_password: PASSWORD })).data === true
    && (await admin.rpc("disabled_account_password", { p_email: EMAIL, p_password: "nope" })).data === false);
} finally {
  browser.close();
  await admin.auth.admin.updateUserById(authId, { ban_duration: "none" });
  sql(`update public.users set status = 'active' where email = '${EMAIL}'`);
}

finish("disabled sign-in");
