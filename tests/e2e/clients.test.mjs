/**
 * Adding a client (Sean, Oct 2026): New client on the Clients page, the
 * account then offered for its projects and its users, and Edit on the
 * client's own page.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/clients.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const NAME = `Capital Test ${Date.now()}`;
const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1280, height: 900 });
  await admin.go("/clients", 4000);

  section("New client");
  check("the Clients page has New client", Boolean(await admin.ev(`!!document.querySelector('[data-new-client]')`)));
  await admin.click("[data-new-client]");
  await until(() => admin.ev(`!!document.querySelector('[data-client-form] input[name="name"]')`));
  await admin.fill('[data-client-form] input[name="name"]', NAME);
  await admin.fill('[data-client-form] input[name="contact_name"]', "Bret Godsey");
  await admin.fill('[data-client-form] input[name="state"]', "az");
  await admin.click("[data-client-form] button[type=submit]");
  check("it is added", Boolean(await until(() => sql(`select state from public.companies where name = ${lit(NAME)}`) === "AZ")));
  check("…and listed", Boolean(await until(async () => (await admin.text()).includes(NAME))));

  section("Then its users and projects");
  await admin.go("/users", 4000);
  await admin.click("button", "Add user");
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] select[name="company_id"]')`));
  check("Add user offers it as the client account", await admin.ev(`[...document.querySelectorAll('[role=dialog] select[name="company_id"] option')].some((o) => o.textContent === ${JSON.stringify(NAME)})`));

  section("Edit");
  const slug = NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await admin.go(`/clients/${slug}`, 4000);
  await admin.click("[data-edit-client]");
  await until(() => admin.ev(`!!document.querySelector('[data-client-form] input[name="phone"]')`));
  await admin.fill('[data-client-form] input[name="phone"]', "(602) 555-0123");
  await admin.click("[data-client-form] button[type=submit]");
  check("a client's details change on its page", Boolean(await until(() => sql(`select phone from public.companies where name = ${lit(NAME)}`) === "(602) 555-0123")));
} finally {
  browser.close();
  sql(`delete from public.activity_log where action like 'company.%' and detail = ${lit(NAME)}`);
  sql(`delete from public.companies where name = ${lit(NAME)}`);
}

finish("clients");
