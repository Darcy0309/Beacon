/**
 * Signing out, and a page opened before a new deployment (Nov 2026: "Server Action … was not found on the
 * server. Lighthouse could not start" on Sign out). Sign out is a plain form post to /auth/sign-out, the same
 * in every deployment: it signs out and goes to the sign-in page, the session gone, in the activity log. A
 * call to the server from a page that still holds an old deployment's Server Action ids (the id swapped on
 * its way here, as an old page sends it) is not an error screen: the page loads the new version by itself.
 *
 *   node tests/run.mjs tests/e2e/sign-out-after-deploy.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const ADMIN = Number(sql("select id from public.users where email='admin@beacon.test'"));
const PROJECT = Number(sql("select id from public.projects where deleted_at is null order by id limit 1"));
const signOuts = () => Number(sql(`select count(*) from public.activity_log where user_id = ${ADMIN} and action = 'sign_out'`));

const browser = await launchBrowser({ mouse: true });
try {
  section("A page from before a deploy calls the server: it loads the new version");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go(`/projects/${PROJECT}`, 7000);
  await until(() => admin.ev("!!document.querySelector('[data-copy-project-info]')"), { timeout: 20000 });
  // Every Server Action call from here on carries an id no deployment has, as an old page's would.
  await admin.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  let swapped = 0;
  admin.on("Fetch.requestPaused", ({ requestId, request }) => {
    const name = Object.keys(request.headers).find((h) => h.toLowerCase() === "next-action");
    if (request.method !== "POST" || !name) return admin.send("Fetch.continueRequest", { requestId }).catch(() => {});
    swapped++;
    const headers = Object.entries(request.headers).map(([n, value]) => ({ name: n, value: n === name ? "00".repeat(21) : value }));
    return admin.send("Fetch.continueRequest", { requestId, headers }).catch(() => {});
  });
  await admin.ev("window.__beforeDeploy = true");
  await admin.ev("document.querySelector('[data-copy-project-info]').click()");
  check("the call went with an old id", Boolean(await until(() => swapped > 0, { timeout: 10000 })));
  check("…and the page loaded again by itself (the new version), no error screen", Boolean(await until(async () => (await admin.ev("window.__beforeDeploy === undefined && document.readyState === 'complete'")) === true, { timeout: 15000 })));
  await admin.send("Fetch.disable");
  check("…on the same page", (await admin.path()) === `/projects/${PROJECT}` && !/could not start|was not found on the server/i.test(await admin.text()));

  section("Sign out: a plain form post");
  await admin.go("/", 6000);
  const before = signOuts();
  // As a person signs out: the door by their name, then Sign out in the box that asks.
  await admin.ev(`document.querySelector('button.signout-button').click()`);
  await until(() => admin.ev(`!!document.querySelector('form[action="/auth/sign-out"] [data-confirm]')`), { timeout: 8000 });
  check("Sign out is a form post to /auth/sign-out", Boolean(await admin.ev(`[...document.querySelectorAll('form[action="/auth/sign-out"]')].some((f) => f.method === 'post')`)));
  await admin.mouseClick('form[action="/auth/sign-out"] [data-confirm]');
  check("…on to the sign-in page", Boolean(await until(async () => (await admin.path()) === "/login", { timeout: 15000 })), await admin.path());
  check("…in the activity log", Boolean(await until(() => signOuts() === before + 1, { timeout: 5000 })));
  await admin.go("/", 4000);
  check("…and signed out: the workspace sends them to sign in", (await admin.path()) === "/login");

  section("Signed out already (a session gone): still to the sign-in page");
  const r = await fetch("http://localhost:3000/auth/sign-out", { method: "POST", redirect: "manual" });
  check("a 303 to /login, not an error", r.status === 303 && new URL(r.headers.get("location"), "http://x").pathname === "/login", `${r.status} ${r.headers.get("location")}`);
  await sleep(100);
} finally {
  browser.close();
}

finish("sign out after deploy");
