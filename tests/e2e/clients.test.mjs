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

  section("A project with its own office");
  const companyId = Number(sql(`select id from public.companies where name = ${lit(NAME)}`));
  sql(`update public.companies set address = '1 Central Ave', city = 'Phoenix', zip = '85004', timezone_id = (select id from public.timezones where name = 'MST') where id = ${companyId}`);
  await admin.go("/projects", 4000);
  await admin.click("button", "New project");
  await until(() => admin.ev(`!!document.querySelector('[data-project-office-form]')`));
  await admin.fill('[role=dialog] input[name="name"]', `${NAME} CA Appts`);
  await admin.fill('[role=dialog] select[name="company_id"]', String(companyId));
  await admin.click("[data-use-client-office]");
  check("Use the client's details fills in the office", Boolean(await until(() => admin.ev(`document.querySelector('[role=dialog] input[name="city"]').value === "Phoenix" && document.querySelector('[role=dialog] input[name="phone"]').value === "(602) 555-0123"`))));
  await admin.fill('[role=dialog] input[name="contact_name"]', "Dana Cole");
  await admin.fill('[role=dialog] input[name="city"]', "San Diego");
  await admin.fill('[role=dialog] input[name="state"]', "ca");
  await admin.fill('[role=dialog] select[name="timezone_id"]', sql("select id from public.timezones where name = 'PST'"));
  await admin.click("[role=dialog] button[type=submit]");
  check("…and it can be the project's own: another agent, state and time zone",
    Boolean(await until(() => sql(`select p.contact_name || '|' || p.city || '|' || p.state || '|' || t.name || '|' || p.address from public.projects p join public.timezones t on t.id = p.timezone_id where p.name = ${lit(`${NAME} CA Appts`)}`) === "Dana Cole|San Diego|CA|PST|1 Central Ave")),
    sql(`select coalesce(contact_name || '|' || city || '|' || state, 'none') from public.projects where name = ${lit(`${NAME} CA Appts`)}`));

  section("Imports");
  await admin.go("/imports", 4000);
  const template = await admin.ev(`decodeURIComponent((document.querySelector('[data-import-template]')?.getAttribute('href') ?? '').split(',').slice(1).join(','))`);
  check("a template to download: the headings the import reads", template.startsWith("Company,Contact,") && /Ultimate XDate/.test(template) && /Call Result DBDV/.test(template), template.slice(0, 80));
} finally {
  sql(`delete from public.projects where name = ${lit(`${NAME} CA Appts`)}`);
  browser.close();
  sql(`delete from public.activity_log where action like 'company.%' and detail = ${lit(NAME)}`);
  sql(`delete from public.companies where name = ${lit(NAME)}`);
}

finish("clients");
