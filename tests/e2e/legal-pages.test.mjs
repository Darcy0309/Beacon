/**
 * The public Privacy Policy and Terms pages, for the texting registration (A2P 10DLC, Nov 2026): open to
 * anyone, titled as the carriers ask, naming the registered brand (Lakeside Insurance Marketing LLC) and
 * the name its texts go out as (Signature Marketing), with the SMS statements a reviewer looks for.
 *
 *   node tests/run.mjs tests/e2e/legal-pages.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { APP_URL } from "../support/env.mjs";

const page = async (path) => {
  const res = await fetch(`${APP_URL}${path}`, { redirect: "manual" });
  return { status: res.status, html: (await res.text()).replace(/<!-- -->/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&rsquo;/g, "'") };
};

section("Privacy Policy");
const privacy = await page("/privacy");
check("open to anyone, no sign-in", privacy.status === 200, String(privacy.status));
check("titled Privacy Policy", /<title>Privacy Policy/.test(privacy.html));
check("names the registered brand, doing business as Signature Marketing", privacy.html.includes("Lakeside Insurance Marketing LLC, doing business as Signature Marketing"));
check("…and says SMS opt-in data isn't sold or shared", privacy.html.includes("We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes"));

section("Terms & Conditions");
const terms = await page("/terms");
check("open to anyone, no sign-in", terms.status === 200, String(terms.status));
check("titled Terms & Conditions", /<title>Terms & Conditions/.test(terms.html));
check("names the registered brand", terms.html.includes("Lakeside Insurance Marketing LLC, doing business as Signature Marketing"));
check("…with SMS Terms and “Message and data rates may apply”", terms.html.includes("SMS Terms") && terms.html.includes("Message and data rates may apply"));

finish("legal pages");
