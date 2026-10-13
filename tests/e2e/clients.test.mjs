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
// Two insurance companies to group clients by, and a second client in another group.
const GROUP = `Farmers Test ${Date.now()}`;
const groupId = Number(sql(`insert into public.agencies (name) values (${lit(GROUP)}) returning id`));
const otherGroup = Number(sql(`insert into public.agencies (name) values (${lit(`${GROUP} Other`)}) returning id`));
const otherClient = Number(sql(`insert into public.companies (name, agency_group_id) values (${lit(`${NAME} Elsewhere`)}, ${otherGroup}) returning id`));
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

  section("Agency Group");
  await admin.go(`/clients/${slug}`, 4000);
  await admin.click("[data-edit-client]");
  await until(() => admin.ev(`!!document.querySelector('[data-client-form] select[name="agency_group_id"]')`));
  const field = await admin.ev(`(() => { const f = document.querySelector('[data-client-form]'); const labels = [...f.querySelectorAll('label')].map((l) => l.textContent.replace('*', '').trim());
    const sel = f.querySelector('select[name="agency_group_id"]'); return { labels, options: [...sel.options].map((o) => o.textContent), value: sel.value }; })()`);
  check("the client form has Agency Group, below the name and the primary contact", field.labels.indexOf("Agency Group") > field.labels.indexOf("Primary contact") && field.labels.indexOf("Agency Group") < field.labels.indexOf("Phone"), JSON.stringify(field.labels));
  check("…a drop-down of the insurance companies list, none chosen yet", field.options[0] === "None" && field.options.includes(GROUP) && field.value === ""
    && field.options.length - 1 === Number(sql("select count(distinct lower(name)) from public.agencies where deleted_at is null")), `${field.options.length} options`);
  await admin.fill('[data-client-form] select[name="agency_group_id"]', String(groupId));
  await admin.click("[data-client-form] button[type=submit]");
  check("choosing one saves it on the client", Boolean(await until(() => sql(`select agency_group_id from public.companies where name = ${lit(NAME)}`) === String(groupId))));
  check("…and its page shows it", Boolean(await until(async () => (await admin.ev(`document.querySelector('[data-agency-group]')?.textContent`)) === GROUP)));
  await admin.click("[data-edit-client]");
  check("the form opens on the group it has", Boolean(await until(() => admin.ev(`document.querySelector('[data-client-form] select[name="agency_group_id"]')?.value === "${groupId}"`))));
  await admin.key("Escape");
  await admin.go("/clients", 4000);
  check("the Clients page names each client's group", Boolean(await until(async () => (await admin.text()).includes(GROUP))));
  await admin.go(`/clients?group=${groupId}`, 4000);
  const shown = await admin.ev(`[...document.querySelectorAll('a[href^="/clients/"]')].map((a) => a.innerText.split('\\n')[0].trim())`);
  check("…and filters to one agency group: this client, not the other group's", (await admin.text()).includes(NAME) && !(await admin.text()).includes(`${NAME} Elsewhere`) && /1 total/i.test(await admin.text()), JSON.stringify(shown));

  section("Agency Group in Production & Pay");
  // A call today on a project of each client.
  const companyOf = Number(sql(`select id from public.companies where name = ${lit(NAME)}`));
  const me = Number(sql("select id from public.users where email = 'admin@beacon.test'"));
  const proj = (name, company) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(name)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
  const [mine, theirs] = [proj(`${NAME} P1`, companyOf), proj(`${NAME} P2`, otherClient)];
  sql(`insert into public.call_records (project_id, user_id, call_result, call_date) values (${mine}, ${me}, 'Viable-CallBack', now()), (${mine}, ${me}, 'Viable-CallBack', now()), (${theirs}, ${me}, 'Viable-CallBack', now())`);
  await admin.go("/reports/production?period=today", 6000);
  const text = () => admin.ev(`document.body.innerText.replace(/\\s+/g, ' ')`);
  check("the report offers the agency groups clients are in", Boolean(await until(async () => /Agency group/i.test(await text()))));
  const callsOf = async () => Number((await text()).match(/Calls (\d[\d,]*)/i)?.[1]?.replace(/,/g, "") ?? NaN);
  const all = await callsOf();
  await admin.go(`/reports/production?period=today&group=${groupId}`, 6000);
  check("filtered to a group, it counts only that group's clients", Boolean(await until(async () => (await callsOf()) === 2)) && all >= 3, `${all} → ${await callsOf()}`);
  const byClient = await admin.ev(`[...document.querySelectorAll('tr[data-client]')].map((r) => r.innerText.replace(/\\s+/g, ' '))`);
  check("…By Client lists only that group's client, with the group under its name", byClient.length === 1 && byClient[0].startsWith(`${NAME} ${GROUP} `), JSON.stringify(byClient));
  const csv = await admin.ev(`fetch('/api/reports/production?period=today&by=group').then((r) => r.text())`);
  check("the CSV adds up by agency group", new RegExp(`^.?Agency group,Calls,`).test(csv) && new RegExp(`\\n${GROUP},2,`).test(csv) && new RegExp(`\\n${GROUP} Other,1,`).test(csv), csv.slice(0, 260));
  const one = await admin.ev(`fetch('/api/reports/production?period=today&by=client&group=${groupId}').then((r) => r.text())`);
  check("…and any CSV keeps to the group chosen", one.includes(NAME) && !one.includes(`${NAME} Elsewhere`) && /\nTotal,2,/.test(one), one.slice(0, 200));

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
  sql(`delete from public.call_records where project_id in (select id from public.projects where name like ${lit(`${NAME} P%`)})`);
  sql(`delete from public.projects where name = ${lit(`${NAME} CA Appts`)} or name like ${lit(`${NAME} P%`)}`);
  browser.close();
  sql(`delete from public.activity_log where action like 'company.%' and detail = ${lit(NAME)}`);
  sql(`delete from public.companies where name = ${lit(NAME)} or id = ${otherClient}`);
  sql(`delete from public.agencies where id in (${groupId}, ${otherGroup})`);
}

finish("clients");
