/**
 * "Forgot your password?" from any device (Sean, Nov 2026: "the link that comes up on my email sends me to
 * this error page"). The reset link is Lighthouse's own: asked for in one browser, it works in another
 * (a phone, another browser, the email app's own). Opening it changes nothing (an email scanner opening it
 * can't use it up); Set a new password signs in and opens My Security, where the new password is set and
 * then works. Used once, it says so on the sign-in page. An address with no account gets the same answer
 * and no email; asked for too often, it says to wait.
 *
 * Needs the app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (any SMTP_USER and SMTP_PASSWORD).
 *
 *   node tests/run.mjs tests/e2e/password-reset-link.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";
import { adminClient, signIn } from "../support/auth.mjs";
import { PASSWORD } from "../support/env.mjs";

const EMAIL = "agent@beacon.test";
const AUTH_ID = sql(`select auth_id from public.users where email = ${lit(EMAIL)}`);
const NEW_PASSWORD = `Reset!${Date.now()}x`;
const mailBefore = sql("select coalesce((select value::text from public.app_settings where key = 'mail'), '')");
sql(`update public.app_settings set value = value || '{"from": "alerts@signaturemktg.net"}'::jsonb where key = 'mail'`);
sql(`delete from public.activity_log where action = 'password.reset_link' and detail in (${lit(EMAIL)}, 'nobody-here@beacon.test')`);

const mail = await startMailCatcher(2525);
const browser = await launchBrowser({ mouse: true });
const plain = (m) => m.raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const sentTo = (to) => mail.messages.filter((m) => m.to.some((t) => t.includes(to)));
const ask = async (page, email) => {
  await page.go("/login", 4000);
  await page.click("button", "Forgot your password?");
  await until(() => page.ev("!!document.querySelector('[data-forgot-password] input[name=\"email\"]')"));
  await page.fill('[data-forgot-password] input[name="email"]', email);
  await page.click("[data-forgot-password] button[type=submit]");
  return until(async () => (await page.ev(`document.querySelector('[data-forgot-password] [role=status], [data-forgot-password] [role=alert]')?.textContent ?? null`)), { timeout: 15000 });
};
try {
  section("Asked for in one browser");
  const asker = await (await browser.newContext()).newPage({ width: 1280, height: 900 });
  const said = await ask(asker, EMAIL);
  check("a link is on its way, for any device", /on its way/.test(said ?? "") && /any device/.test(said ?? ""), said);
  const email = await until(() => sentTo(EMAIL).at(-1) ?? null, { timeout: 15000 });
  const body = email ? plain(email) : "";
  const url = body.match(/https?:\/\/[^\s"<>]+\/auth\/reset\?token_hash=[A-Za-z0-9_%-]+/)?.[0]?.replace(/&amp;/g, "&");
  check("Lighthouse's own email, with its own link", Boolean(url) && /Reset your Lighthouse password/.test(body), body.slice(0, 300));

  section("Opened in another browser");
  const phone = await (await browser.newContext()).newPage({ width: 420, height: 860 });
  await phone.go(url, 4000);
  check("the reset page, asking first", Boolean(await until(() => phone.ev("!!document.querySelector('[data-reset-continue]')"))));
  await phone.go(url, 3000);
  check("…opening it again (as an email scanner would) hasn't used it up", Boolean(await until(() => phone.ev("!!document.querySelector('[data-reset-continue]')"))));
  await phone.mouseClick("[data-reset-continue]");
  check("Set a new password: signed in, on My Security", Boolean(await until(async () => (await phone.path()) === "/security" && (await phone.ev("!!document.querySelector('[data-reset-note]')")), { timeout: 15000 })), await phone.ev("location.href"));
  await phone.fill('input[name="password"]', NEW_PASSWORD);
  await phone.fill('input[name="confirm"]', NEW_PASSWORD);
  await phone.click("button[type=submit]", "Change password");
  await sleep(2500);
  const { error: newErr } = await signIn(EMAIL, NEW_PASSWORD).then(() => ({ error: null }), (e) => ({ error: e }));
  check("…and the new password works", !newErr, newErr?.message);

  section("Used once");
  const again = await (await browser.newContext()).newPage({ width: 1280, height: 900 });
  await again.go(url, 3000);
  await again.mouseClick("[data-reset-continue]");
  check("the link a second time: the sign-in page says it's used, and how to get another",
    Boolean(await until(async () => (await again.path()) === "/login" && /password reset link has expired or was already used/i.test(await again.text()), { timeout: 15000 })), await again.text());

  section("No such account, and asked for too often");
  const n = mail.messages.length;
  const none = await ask(await (await browser.newContext()).newPage(), "nobody-here@beacon.test");
  await sleep(1500);
  check("an address with no account: the same answer, and no email", /on its way/.test(none ?? "") && mail.messages.length === n, none);
  const p = await (await browser.newContext()).newPage();
  await ask(p, EMAIL);
  await ask(p, EMAIL);
  const fourth = await ask(p, EMAIL);
  check("a fourth time in fifteen minutes: wait a few minutes", /Too many requests/.test(fourth ?? ""), fourth);
} finally {
  browser.close();
  mail.close();
  await adminClient().auth.admin.updateUserById(AUTH_ID, { password: PASSWORD });
  sql(`delete from public.activity_log where action = 'password.reset_link' and detail in (${lit(EMAIL)}, 'nobody-here@beacon.test')`);
  if (mailBefore) sql(`update public.app_settings set value = ${lit(mailBefore)}::jsonb where key = 'mail'`);
}

finish("password reset link");
