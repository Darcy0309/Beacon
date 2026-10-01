/**
 * Moving around with the sidebar, as a person does: a real mouse over each
 * tab and a click. Every click must land on its page with the page's content
 * on screen, however quickly the clicks come; and a page that fails on the
 * server must recover where it is, without a trip to another tab.
 *
 * Opening a page used to prefetch every link on it (the sidebar and the
 * page's own tables, 30-odd requests, each two Supabase round trips on the
 * server). Links now prefetch on intent: a page load sends none, and
 * hovering a link prefetches that one.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { navGroups } from "../../src/lib/nav.js";

const XDATES_FN = "public.xdates_by_month(bigint, bigint)";
const revokeXdates = () => sql(`revoke execute on function ${XDATES_FN} from authenticated`);
const grantXdates = () => sql(`grant execute on function ${XDATES_FN} to authenticated`);

const browser = await launchBrowser();
const ERROR = /Something went wrong|Taking a moment longer|Application error|This page could not be found/i;
const tabs = navGroups.flatMap((g) => g.items).filter((i) => i.roles.includes("admin")).map((i) => i.href);
const rscFetches = (page, path) => page.ev(`performance.getEntriesByType('resource')
  .filter((e) => e.name.includes('_rsc=')${path ? ` && new URL(e.name).pathname === ${JSON.stringify(path)}` : ""}).length`);
/** The page for `href` is showing: the address, no loading skeleton, its own content. */
const landed = (page, href) => page.ev(`location.pathname === ${JSON.stringify(href)}
  && !document.querySelector('[aria-busy="true"]')
  && !!document.querySelector('header h1')`);
const link = (href) => `aside nav a[href="${href}"]`;

try {
  const page = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();

  section("Opening a page prefetches nothing until someone points at a link");
  await page.go("/", 5000);
  const onOpen = await rscFetches(page);
  check("opening the dashboard sends no prefetches", onOpen <= 1, `${onOpen} prefetch requests`);
  await page.hover(link("/leads"));
  check("pointing at Leads prefetches just that page", await until(async () => (await rscFetches(page, "/leads")) >= 1, { timeout: 4000 }), `${await rscFetches(page, "/leads")}`);
  check("…and nothing else", (await rscFetches(page)) - (await rscFetches(page, "/leads")) <= 1, `${await rscFetches(page)} in all`);

  section("Every tab, clicked in turn, shows its page");
  for (const round of [1, 2]) {
    const missed = [];
    for (const href of tabs) {
      await page.mouseClick(link(href));
      const ok = await until(() => landed(page, href), { timeout: 10000, interval: 100 });
      const text = ok ? await page.text() : "";
      if (!ok || ERROR.test(text)) missed.push(`${href}${ok ? " (error page)" : ` (stuck on ${await page.path()})`}`);
    }
    check(`round ${round}: all ${tabs.length} tabs opened on the first click`, missed.length === 0, missed.join(", "));
  }

  section("Clicks in quick succession");
  const pairs = [["/clients", "/projects"], ["/appointments", "/calendar"], ["/reports", "/reports/production"], ["/qa", "/documents"]];
  const lost = [];
  for (const [first, second] of pairs) {
    await page.mouseClick(link(first));
    await sleep(120);
    await page.mouseClick(link(second));
    if (!(await until(() => landed(page, second), { timeout: 10000, interval: 100 }))) lost.push(`${first} → ${second} (on ${await page.path()})`);
  }
  check("the last of two quick clicks wins, with its content", lost.length === 0, lost.join(", "));

  section("Coming back to a tab");
  await page.mouseClick(link("/leads"));
  await until(() => landed(page, "/leads"), { timeout: 10000 });
  await page.mouseClick(link("/"));
  check("back on the dashboard, its content is there", await until(() => landed(page, "/"), { timeout: 10000 }) && /Command Center/i.test(await page.text()));

  // A page that fails on the server (here: its database function revoked) must
  // come back where it is once the database does. The error screen used to
  // re-render the failure it already had, so the page stayed broken until the
  // reader went to another tab and back.
  section("A page that fails recovers in place");
  const screen = (p) => p.ev(`/reconnecting/i.test(document.body.innerText) ? 'reconnecting' : /Something went wrong/i.test(document.body.innerText) ? 'error'
    : /Renewals by Month/i.test(document.body.innerText) ? 'content' : 'other'`);
  try {
    // The database comes back while the screen says it is reconnecting: no click needed.
    const a = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
    await a.go("/", 4000);
    revokeXdates();
    await a.mouseClick(link("/reports/x-dates"));
    const reconnecting = await until(async () => (await screen(a)) === "reconnecting", { timeout: 15000, interval: 20 });
    grantXdates();
    check("a failed page says it is reconnecting", reconnecting, await screen(a));
    check("…and shows its content once the database is back, by itself", await until(async () => (await screen(a)) === "content", { timeout: 8000 }), await screen(a));

    // Still failing through the automatic retry: Try again, once it is back, loads it.
    const b = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
    await b.go("/", 4000);
    revokeXdates();
    await b.mouseClick(link("/reports/x-dates"));
    check("still failing after the automatic retry: the error card", await until(async () => (await screen(b)) === "error", { timeout: 20000 }), await screen(b));
    grantXdates();
    await b.click("button", "Try again");
    check("Try again loads the page from the server", await until(async () => (await screen(b)) === "content", { timeout: 8000 }), await screen(b));
  } finally {
    grantXdates();
  }
} finally {
  browser.close();
}

finish("navigation");
