/**
 * Form validation in a real browser: open the New Lead dialog, submit invalid
 * data and expect inline errors with nothing written; then submit valid data
 * and expect the lead to exist, stored the way the database wants it.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, sleep, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const browser = await launchBrowser();
// Leads is an admin and agent page (managers work from Projects).
const admin = await browser.newContext({ as: "admin@beacon.test" });
const page = await admin.newPage({ width: 1440, height: 1100 });
const shot = (name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);
const waitFor = (expr, timeout = 8000) => until(() => page.ev(expr), { timeout, interval: 150 });

await page.go("/leads", 500);
check("leads page loads signed in", await waitFor(`!!document.querySelector('table')`, 15000));
await page.ev(`[...document.querySelectorAll('button')].find((b) => /new lead/i.test(b.textContent)).click()`);
check("New Lead dialog opens", await waitFor(`!!document.querySelector('[role="dialog"] form input[name="company_name"]')`));

const fillAndSubmit = (values) =>
  page.ev(`(() => {
    const set = (n, v) => { const el = document.querySelector('[role="dialog"] form [name="' + n + '"]'); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    for (const [n, v] of Object.entries(${JSON.stringify(values)})) set(n, v);
    document.querySelector('[role="dialog"] form button[type="submit"]').click();
  })()`);

// 1. Invalid: every field wrong in a different way.
await fillAndSubmit({ company_name: "", state: "Freedonia", email: "not-an-email", employees: "lots", zip: "123" });
check("inline errors render after invalid submit", await waitFor(`document.querySelectorAll('[role="dialog"] form [role="alert"]').length >= 5`));
const errs = await page.ev(`[...document.querySelectorAll('[role="dialog"] form [role="alert"]')].map((e) => e.textContent.trim())`);
check("company name error", errs.some((e) => /company name is required/i.test(e)));
check("state error", errs.some((e) => /state code/i.test(e)));
check("email error", errs.some((e) => /valid email/i.test(e)));
check("employees error", errs.some((e) => /whole number/i.test(e)));
check("zip error", errs.some((e) => /zip/i.test(e)));
check("invalid inputs are marked aria-invalid", (await page.ev(`document.querySelectorAll('[role="dialog"] form [aria-invalid="true"]').length`)) >= 5);
check("dialog stays open on error", await page.ev(`!!document.querySelector('[role="dialog"] form input[name="company_name"]')`));
check("user's typed values are preserved", (await page.ev(`document.querySelector('[role="dialog"] form [name="state"]').value`)) === "Freedonia");
await shot("lead-form-invalid");

const { sb } = await signIn("admin@beacon.test");
const { count } = await sb.from("leads").select("id", { count: "exact", head: true }).eq("email", "not-an-email");
check("invalid submit wrote nothing to the database", count === 0);

// 2. Valid.
const marker = `E2E ${Date.now()}`;
await fillAndSubmit({ company_name: marker, state: "AZ", email: "ok@example.test", employees: "12", zip: "85016" });
check("dialog closes after valid submit", await waitFor(`!document.querySelector('[role="dialog"] form input[name="company_name"]')`, 10000));
await sleep(600);
const { data } = await sb.from("leads").select("id, state, email").eq("company_name", marker).maybeSingle();
check("valid submit created the lead", Boolean(data?.id));
check("state was stored as the 2-letter code", data?.state === "AZ");
if (data?.id) await sb.from("leads").delete().eq("id", data.id);
await shot("lead-form-after-valid");

browser.close();
finish("lead form");
