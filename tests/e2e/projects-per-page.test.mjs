/**
 * All Projects, 100 to a page to begin with (Sean, Nov 2026: each client has a DB dev and an appointment
 * project, so 10 to a page showed only 5 clients); another size kept when chosen; other lists still 10.
 *
 *   node tests/run.mjs tests/e2e/projects-per-page.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const projects = Number(sql("select count(*) from public.projects where deleted_at is null"));
const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  const per = () => admin.ev(`document.querySelector('select[aria-label="Rows per page"]')?.value ?? null`);
  const rows = () => admin.ev(`document.querySelectorAll('table tbody tr[data-list-row], table tbody tr[data-row]').length || document.querySelectorAll('table tbody tr').length`);

  section("All Projects");
  await admin.go("/projects", 6000);
  check("100 to a page to begin with", (await until(per, { timeout: 15000 })) === "100", await per());
  check(`…every project on it (${projects}, under 100)`, projects > 100 || (await rows()) === projects, `${await rows()} rows of ${projects}`);
  await admin.fill('select[aria-label="Rows per page"]', "10");
  check("10 chosen: kept in the address, 10 rows", Boolean(await until(async () => (await admin.url()).includes("per=10") && (await rows()) === Math.min(10, projects), { timeout: 15000 })), `${await admin.url()} · ${await rows()}`);
  await admin.fill('select[aria-label="Rows per page"]', "100");
  check("100 again: the default, left out of the address", Boolean(await until(async () => !(await admin.url()).includes("per=") && (await per()) === "100", { timeout: 15000 })), await admin.url());

  section("Another list");
  await admin.go("/leads", 6000);
  check("the Leads list: still 10 to a page to begin with", (await until(per, { timeout: 15000 })) === "10", await per());
} finally {
  browser.close();
}
finish("projects per page");
