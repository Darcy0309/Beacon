/**
 * Two things the old system had that Lighthouse lacked:
 *   - "Forgot your password?" on the sign-in page emails a link (read here
 *     from the local mail catcher, Mailpit) that signs the person in and
 *     opens My Security to set a new password; an unknown address gets the
 *     same answer, so nobody learns who has an account;
 *   - an administrator adds and edits carriers (name, lines of business,
 *     states), one way of writing each name.
 *
 * Runs on its own test client and puts back everything it changed.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { adminClient, signIn } from "../support/auth.mjs";
import { APP_URL, PASSWORD } from "../support/env.mjs";

const RUN = Date.now();
const MAILPIT = process.env.TEST_MAILPIT_URL ?? "http://127.0.0.1:54324";
const WHO = "rachel@beacon.test";
const NEW_PASSWORD = `Reset-${RUN}!x`;
const CARRIER = `Quillon Mutual ${RUN}`;
const RACHEL_AUTH = sql(`select auth_id from public.users where email = ${lit(WHO)}`);

const latest = async (to, after) => {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`).then((x) => x.json()).catch(() => null);
  const m = (r?.messages ?? []).find((x) => new Date(x.Created).getTime() >= after);
  return m ? fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then((x) => x.json()) : null;
};

const browser = await launchBrowser();

try {
  section("Forgot your password?");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // On the auth Site URL's own host, as on live: the link comes back to the
  // browser that asked for it, which holds the PKCE verifier cookie.
  const site = new URL(APP_URL);
  site.hostname = "127.0.0.1";
  await page.go(new URL("/login", site).href, 3000);
  await page.click("button", "Forgot your password?");
  check("the sign-in page asks for the email", Boolean(await until(() => page.ev(`!!document.querySelector('[data-forgot-password] input[name="email"]')`))));
  await page.fill('[data-forgot-password] input[name="email"]', `nobody.${RUN}@beacon.test`);
  await page.click("[data-forgot-password] button[type=submit]");
  const unknown = await until(() => page.ev(`document.querySelector('[data-forgot-password] [role=status]')?.textContent ?? null`));
  check("an unknown address gets the same answer: nothing given away", /If nobody\..*has a Lighthouse account, a link .* is on its way/.test(unknown ?? ""), unknown);
  await page.click("[data-forgot-password] button", "Back to sign in");
  await page.click("button", "Forgot your password?");
  const asked = Date.now() - 2000;
  await until(() => page.ev(`!!document.querySelector('[data-forgot-password] input[name="email"]')`));
  await page.fill('[data-forgot-password] input[name="email"]', WHO);
  await page.click("[data-forgot-password] button[type=submit]");
  check("a real one: the same answer", Boolean(await until(() => page.ev(`!!document.querySelector('[data-forgot-password] [role=status]')`))));
  const mail = await until(() => latest(WHO, asked), { timeout: 15000, interval: 500 });
  const link = (mail?.Text ?? "").match(/https?:\/\/\S+verify\S+/)?.[0]?.replace(/&amp;/g, "&");
  check("the email arrives with a reset link", Boolean(link), (mail?.Text ?? "no email").slice(0, 200));
  await page.go(link ?? "/login", 5000);
  check("the link signs her in and opens My Security to set a new password",
    Boolean(await until(async () => (await page.path()) === "/security" && page.ev(`!!document.querySelector('[data-reset-note]')`), { timeout: 10000 })), await page.url());
  await page.fill('input[name="password"]', NEW_PASSWORD);
  await page.fill('input[name="confirm"]', NEW_PASSWORD);
  await page.click("button[type=submit]", "Set password");
  check("saving says so", /Password (changed|set)/.test((await page.waitToast(/Password (changed|set)/, 10000)) ?? ""));
  const fresh = await signIn(WHO, NEW_PASSWORD);
  const stale = await signIn(WHO);
  check("she signs in with the new password, not the old one", !fresh.error && Boolean(stale.error), fresh.error?.message);

  section("Carriers");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  await admin.go("/insurance-companies", 4000);
  await admin.click("[data-add-carrier]");
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] input[name="name"]')`));
  await admin.fill('[role=dialog] input[name="name"]', CARRIER);
  await admin.fill('[role=dialog] input[name="association"]', "P&C, Workers comp");
  await admin.fill('[role=dialog] input[name="territory"]', "az, New Mexico, CA");
  await admin.click("[role=dialog] button[type=submit]");
  const saved = await until(() => sql(`select association || ' | ' || territory from public.agencies where name = ${lit(CARRIER)}`) || null);
  check("an administrator adds a carrier, its lines and its states (written as codes)", saved === "P&C, Workers comp | AZ, NM, CA", saved);
  await admin.go(`/insurance-companies?q=${encodeURIComponent(CARRIER)}`, 4000);
  check("…listed with its states", /AZ, NM, CA/.test(await admin.text()));
  await admin.click("[data-add-carrier]");
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] input[name="name"]')`));
  await admin.fill('[role=dialog] input[name="name"]', CARRIER.toUpperCase().replace(" ", "-"));
  await admin.click("[role=dialog] button[type=submit]");
  const refused = await until(() => admin.ev(`[...document.querySelectorAll('[role=dialog] [role=alert]')].map((a) => a.textContent).join(' ') || null`));
  check("the same carrier written another way is refused", /Already on file as/.test(refused ?? ""), refused);
  await admin.key("Escape");
  await sleep(300);
  await admin.pointer(`button[aria-label="Actions for ${CARRIER}"]`);
  await sleep(300);
  check("…and edited from its row", await admin.menuItem("Edit"));
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] input[name="association"]')`));
  await admin.fill('[role=dialog] input[name="association"]', "P&C, Life");
  await admin.fill('[role=dialog] input[name="territory"]', "Texas");
  await admin.click("[role=dialog] button[type=submit]");
  check("…saved", Boolean(await until(() => sql(`select association || ' | ' || territory from public.agencies where name = ${lit(CARRIER)}`) === "P&C, Life | TX")));
  await admin.go("/insurance-companies", 3000);
  await admin.click("[data-add-carrier]");
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] input[name="territory"]')`));
  await admin.fill('[role=dialog] input[name="name"]', `Nowhere Mutual ${RUN}`);
  await admin.fill('[role=dialog] input[name="territory"]', "AZ, Narnia");
  await admin.click("[role=dialog] button[type=submit]");
  const badState = await until(() => admin.ev(`[...document.querySelectorAll('[role=dialog] [role=alert]')].map((a) => a.textContent).join(' ') || null`));
  check("a state that is not one is named", /Not a US state: Narnia/.test(badState ?? ""), badState);
} finally {
  browser.close();
  await adminClient().auth.admin.updateUserById(RACHEL_AUTH, { password: PASSWORD });
  sql(`delete from public.agencies where name like ${lit(`%${RUN}`)}`);
  sql(`delete from public.activity_log where detail like ${lit(`%${RUN}%`)}`);
}

finish("account tools");
