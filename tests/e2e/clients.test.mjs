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

  section("The Clients page: time zone, dates and status on the client");
  await admin.go(`/clients/${slug}`, 4000);
  await admin.click("[data-edit-client]");
  await until(() => admin.ev(`!!document.querySelector('[data-client-form] select[name="timezone_id"]')`));
  const statuses = await admin.ev(`[...document.querySelectorAll('[data-client-form] select[name="status"] option')].map((o) => o.textContent)`);
  check("the form has a time zone, start and end dates, and a status of Active, Paused or Completed", JSON.stringify(statuses) === JSON.stringify(["Active", "Paused", "Completed"])
    && (await admin.ev(`!!document.querySelector('[data-client-form] input[name="subscription_start"]') && !!document.querySelector('[data-client-form] input[name="subscription_end"]')`)), JSON.stringify(statuses));
  const MST = sql("select id from public.timezones where name = 'MST'");
  await admin.fill('[data-client-form] select[name="timezone_id"]', MST);
  await admin.ev(`(() => { const set = (n, v) => { const i = document.querySelector('[data-client-form] input[name="' + n + '"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }; set('subscription_start', '2026-01-26'); set('subscription_end', '2026-12-31'); })()`);
  await admin.click("[data-client-form] button[type=submit]");
  const saved = () => sql(`select timezone_id || '|' || coalesce(subscription_start::text, '') || '|' || coalesce(subscription_end::text, '') || '|' || status from public.companies where name = ${lit(NAME)}`);
  check("they are saved on the client", Boolean(await until(() => saved() === `${MST}|2026-01-26|2026-12-31|active`)), saved());
  sql(`update public.companies set status = 'paused', state = 'CA' where id = ${otherClient}`);

  section("The Clients page: clients in rows");
  await admin.go("/clients", 5000);
  const heads = await until(() => admin.ev(`[...document.querySelectorAll('thead th')].map((h) => h.textContent.trim())`).then((h) => h.length && h));
  check("a table: client, contact, state, time zone, start date, end date, status", JSON.stringify(heads) === JSON.stringify(["Client", "Contact", "State", "Time zone", "Start date", "End date", "Status"]), JSON.stringify(heads));
  const rowOf = (name) => admin.ev(`(() => { const r = [...document.querySelectorAll('tr[data-client-row]')].find((x) => x.querySelector('[data-client-link]')?.textContent === ${JSON.stringify(name)}); return r ? [...r.cells].map((c) => c.innerText.replace(/\\s+/g, ' ').trim()) : null; })()`);
  const myRow = await rowOf(NAME);
  check("the client's row has them all, its agency group under its name", myRow?.[1] === "Bret Godsey" && myRow[2] === "AZ" && myRow[3] === "MST" && myRow[4] === "Jan 26, 2026" && myRow[5] === "Dec 31, 2026"
    && /^active$/i.test(myRow[6]) && myRow[0].includes(NAME) && myRow[0].includes(GROUP), JSON.stringify(myRow));
  const names = () => admin.ev(`[...document.querySelectorAll('tr[data-client-row] [data-client-link]')].map((a) => a.textContent)`);
  const pick = (label, value) => admin.ev(`(() => { const sel = document.querySelector('select[aria-label="Filter by ${label}"]'); if (!sel) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, ${JSON.stringify(value)}); sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  check("it filters by agency group", (await pick("Agency group", GROUP)) && Boolean(await until(async () => { const n = await names(); return n.includes(NAME) && !n.includes(`${NAME} Elsewhere`); })), JSON.stringify(await names()));
  await admin.click("button", "Clear");
  check("…by state", (await pick("State", "CA")) && Boolean(await until(async () => { const n = await names(); return n.includes(`${NAME} Elsewhere`) && !n.includes(NAME); })), JSON.stringify(await names()));
  await admin.click("button", "Clear");
  check("…by time zone", (await pick("Time zone", "MST")) && Boolean(await until(async () => { const n = await names(); return n.includes(NAME) && !n.includes(`${NAME} Elsewhere`); })), JSON.stringify(await names()));
  await admin.click("button", "Clear");
  await admin.click("button", "Paused");
  check("…by status", Boolean(await until(async () => { const n = await names(); return n.includes(`${NAME} Elsewhere`) && !n.includes(NAME); })), JSON.stringify(await names()));
  await admin.click("button", "Clear");
  await admin.fill('input[aria-label^="Search clients"]', "Bret Godsey");
  check("…and searches by contact", Boolean(await until(async () => { const n = await names(); return n.length === 1 && n[0] === NAME; })), JSON.stringify(await names()));
  await admin.ev(`[...document.querySelectorAll('tr[data-client-row]')].find((x) => x.querySelector('[data-client-link]')?.textContent === ${JSON.stringify(NAME)}).cells[2].click()`);
  check("clicking anywhere on a row opens the client", Boolean(await until(async () => (await admin.path()) === `/clients/${slug}`)), await admin.path());
  check("…whose page shows its time zone and dates", /MST/.test(await admin.text()) && /Jan 26, 2026 – Dec 31, 2026/.test(await admin.text()));

  section("The Clients page: tiles");
  const companyNow = Number(sql(`select id from public.companies where name = ${lit(NAME)}`));
  const tileProject = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${NAME} P0`)}, ${companyNow}, (select id from public.project_types where code='APPT'), 1) returning id`));
  const adminId = Number(sql("select id from public.users where email = 'admin@beacon.test'"));
  sql(`insert into public.pay_events (user_id, project_id, kind, amount, created_at) values (${adminId}, ${tileProject}, 'lead', 1, now()), (${adminId}, ${tileProject}, 'lead', 1, now()), (${adminId}, ${tileProject}, 'appointment', 1, now()), (${adminId}, ${tileProject}, 'lead', 1, now() - interval '20 days')`);
  await admin.go("/clients?lr=1D&ar=1D", 6000);
  const counts = sql("select count(*) filter (where status = 'active') || '|' || count(*) filter (where status in ('paused', 'inactive')) || '|' || count(*) filter (where status = 'completed') || '|' || count(*) from public.companies where deleted_at is null").split("|").map(Number);
  const first = await until(() => admin.ev(`document.querySelector('[data-client-statuses]')?.closest('[data-panel]')?.innerText.replace(/\\s+/g, ' ') ?? null`));
  check("1st tile: the active clients, and the inactive ones", new RegExp(`Active Clients ${counts[0]} ${counts[3] - counts[0]} inactive · ${counts[3]} in all`, "i").test(first ?? "")
    && new RegExp(`Paused ${counts[1]} Completed ${counts[2]}`, "i").test(first ?? ""), first);
  const tile = (k) => admin.ev(`document.querySelector('[data-trend-tile="${k}"]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
  const devToday = (k) => Number(sql(`select count(*) from public.pay_events pe join public.projects p on p.id = pe.project_id join public.companies c on c.id = p.company_id where c.status = 'active' and c.deleted_at is null and p.deleted_at is null and pe.kind = '${k}' and not pe.is_chargeback and (pe.created_at at time zone public.business_tz())::date = (now() at time zone public.business_tz())::date`));
  check("2nd tile: the active clients' leads, with a chart and what was developed today", /^Leads [\d,]+ [\d,]+ active · [\d,]+ resolved · active clients/i.test(await tile("leads")) && new RegExp(`${devToday("lead")} developed`).test(await tile("leads"))
    && (await admin.ev(`!!document.querySelector('[data-trend-tile="leads"] [data-trend-line]')`)), await tile("leads"));
  check("3rd tile: their appointments, the same way", /^Appointments [\d,]+ [\d,]+ invalid · active clients/i.test(await tile("appts")) && new RegExp(`${devToday("appointment")} set`).test(await tile("appts")), await tile("appts"));
  const ranges = await admin.ev(`[...document.querySelectorAll('[data-trend-tile="leads"] [data-trend-ranges] a, [data-trend-tile="leads"] [data-trend-ranges] button')].map((a) => a.textContent.trim())`);
  check("each has a stock chart's ranges", JSON.stringify(ranges) === JSON.stringify(["1D", "5D", "1W", "2W", "1M", "3M", "6M", "YTD", "More"]), JSON.stringify(ranges));
  await admin.ev(`[...document.querySelectorAll('[data-trend-tile="leads"] [data-trend-ranges] a')].find((a) => a.textContent.trim() === '1M').click()`);
  check("a range changes that tile alone: Leads to a month, Appointments still the day",
    Boolean(await until(async () => new RegExp(`${devToday("lead") + 1} developed`).test(await tile("leads")) && !/by the hour/.test(await tile("leads")) && /by the hour/.test(await tile("appts")))), `${await tile("leads")} || ${await tile("appts")}`);
  const fourth = await admin.ev(`document.querySelector('[data-breakdown-tile]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
  const mstClients = sql("select count(*) from public.companies c join public.timezones z on z.id = c.timezone_id where c.status = 'active' and c.deleted_at is null and z.name = 'MST'");
  check("4th tile: the active clients by time zone and by agency group", /Active Clients By/i.test(fourth) && /Time zone/i.test(fourth) && new RegExp(`MST ${mstClients}`).test(fourth) && /Agency group/i.test(fourth) && new RegExp(`${GROUP} 1`).test(fourth)
    && !fourth.includes(`${GROUP} Other`), fourth);
  if (process.env.SHOTS) await admin.screenshot(`${process.env.SHOTS}/clients-page.png`);
  sql(`update public.companies set status = 'active' where id = ${otherClient}`);

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

  section("Agency Group on the Projects list");
  await admin.go(`/projects?q=${encodeURIComponent(NAME)}`, 5000);
  const projectNames = () => admin.ev(`[...document.querySelectorAll('a[data-project-link]')].map((a) => a.textContent)`);
  check("each project names its client's agency group", Boolean(await until(async () => (await admin.ev(`[...document.querySelectorAll('[data-project-group]')].map((e) => e.textContent)`)).includes(GROUP))));
  const offered = await admin.ev(`[...(document.querySelector('select[aria-label="Filter by Agency group"]')?.options ?? [])].map((o) => o.textContent.replace(/ \\(\\d+\\)$/, ''))`);
  check("…and the list filters by agency group, offering the groups clients are in", offered.includes(GROUP) && offered.includes(`${GROUP} Other`), JSON.stringify(offered));
  await admin.go(`/projects?q=${encodeURIComponent(NAME)}&group=${groupId}`, 5000);
  check("filtered: that group's clients' projects, not another group's", Boolean(await until(async () => { const n = await projectNames(); return n.includes(`${NAME} P1`) && !n.includes(`${NAME} P2`); })), JSON.stringify(await projectNames()));

  section("Agency Group in the Lead Explorer");
  sql(`insert into public.leads (company_name, project_id) values (${lit(`${NAME} Lead One`)}, ${mine}), (${lit(`${NAME} Lead Two`)}, ${mine}), (${lit(`${NAME} Lead Three`)}, ${theirs})`);
  await admin.go("/explore", 6000);
  check("the explorer has Agency group among its criteria", /Agency group/i.test(await admin.text()));
  await admin.go(`/explore?groups=${groupId}`, 6000);
  const explored = await until(async () => { const t = await admin.ev(`document.body.innerText.replace(/\\s+/g, ' ')`); return /agency group: /i.test(t) ? t : null; });
  check("asked for a group, it finds the leads of that group's clients", (explored ?? "").includes(`${NAME} Lead One`) && (explored ?? "").includes(`${NAME} Lead Two`) && !(explored ?? "").includes(`${NAME} Lead Three`), (explored ?? "").slice(0, 300));
  check("…says so in words, and names the group on each lead", new RegExp(`agency group: ${GROUP}`, "i").test(explored ?? "") && (await admin.ev(`[...document.querySelectorAll('[data-lead-group]')].every((e) => e.textContent === ${JSON.stringify(GROUP)}) && document.querySelectorAll('[data-lead-group]').length === 2`)));
  const exported = await admin.ev(`fetch('/api/explore/export?groups=${groupId}').then(async (r) => ({ total: r.headers.get('x-total-count'), text: await r.text() }))`);
  check("the export keeps to the group and has an Agency Group column", exported.total === "2" && /,Client,Agency Group,/.test(exported.text.split("\r\n")[0]) && exported.text.includes(`,${GROUP},`) && !exported.text.includes("Lead Three"), exported.text.slice(0, 300));
  check("a made-up group in the address is ignored, not an error", (await admin.go("/explore?groups=abc", 5000), !/Something went wrong/i.test(await admin.text())));

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
  sql(`delete from public.leads where company_name like ${lit(`${NAME} Lead %`)}`);
  sql(`delete from public.pay_events where project_id in (select id from public.projects where name like ${lit(`${NAME} P%`)})`);
  sql(`delete from public.call_records where project_id in (select id from public.projects where name like ${lit(`${NAME} P%`)})`);
  sql(`delete from public.projects where name = ${lit(`${NAME} CA Appts`)} or name like ${lit(`${NAME} P%`)}`);
  browser.close();
  sql(`delete from public.activity_log where action like 'company.%' and detail = ${lit(NAME)}`);
  sql(`delete from public.companies where name = ${lit(NAME)} or id = ${otherClient}`);
  sql(`delete from public.agencies where id in (${groupId}, ${otherGroup})`);
}

finish("clients");
