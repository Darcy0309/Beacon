/**
 * Signature Select (Sean, Nov 2026): a client's monthly or annual subscription, set on the client's Edit by an
 * administrator or its Sales Rep. A monthly one shows its months and what it has brought in; the clients list
 * says who is on it; a client whose last term has ended loses access to Lighthouse; the Sales Rep hears two
 * weeks before a term ends; and the admin report adds up what came in, by client and time.
 *
 *   node tests/run.mjs tests/e2e/signature-select.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { addMonthsIso } from "../../src/lib/signature-select.js";

const TAG = `SEL-TEST ${Date.now()}`;
const today = sql(`select public.business_today()`);
const addDays = (iso, n) => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const id = (q) => Number(sql(q));
const MIKE = id(`select id from public.users where email = 'mike@beacon.test'`);
const SEAN = id(`select id from public.users where email = 'sean@beacon.test'`);
const CLIENT = id(`select id from public.users where email = 'client@beacon.test'`);
const as = (user, query) => sql(`set role authenticated; select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: sql(`select auth_id from public.users where id = ${user}`), role: "authenticated", aal: "aal2" }))}, false); ${query}`).split("\n").pop();
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id = ${CLIENT}`);
const company = (name, rep = "null") => id(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} ${name}`)}, ${rep}) returning id`);
const MONTHLY = company("Monthly Ins", MIKE);
const ANNUAL = company("Annual Ins", MIKE);
const ENDED = company("Ended Ins");
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const P = id(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Churches`)}, ${ENDED}, ${typeId("APPT")}, 1) returning id`);
const slug = (name) => `${TAG} ${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const companies = [MONTHLY, ANNUAL, ENDED].join(",");

const browser = await launchBrowser();
try {
  section("Set on the client's Edit");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await admin.go(`/clients/${slug("Monthly Ins")}`, 5000);
  await admin.click("[data-edit-client]");
  await until(() => admin.ev(`!!document.querySelector('[data-select-form] select[name="select_plan"]')`));
  const labels = await admin.ev(`[...document.querySelectorAll('[data-client-form] label')].map((l) => l.textContent.replace('*', '').trim())`);
  check("Start date is now Client since, and the End date is gone", labels.includes("Client since") && !labels.includes("Start date") && !labels.includes("End date"), JSON.stringify(labels));
  await admin.fill('[data-select-form] select[name="select_plan"]', "monthly");
  await until(() => admin.ev(`!!document.querySelector('[data-select-form] input[name="select_amount"]')`));
  await admin.fill('[data-select-form] input[name="select_amount"]', "250");
  await admin.click("[data-client-form] button[type=submit]");
  const saved = await until(() => sql(`select concat_ws('|', plan, amount, starts_on, coalesce(ends_on::text, 'open'), created_by) from public.select_terms where company_id = ${MONTHLY}`) || null, { timeout: 15000 });
  check("a monthly term of $250 from today, running until an end is put in", saved === `monthly|250.00|${today}|open|1`, saved);

  // Three months on: its months and what it has brought in.
  const start = addMonthsIso(today, -3);
  sql(`update public.select_terms set starts_on = ${lit(start)} where company_id = ${MONTHLY}`);
  await admin.go(`/clients/${slug("Monthly Ins")}`, 5000);
  await admin.click("[data-edit-client]");
  const charged = await until(() => admin.ev(`document.querySelector('[data-select-form] [data-select-charged]')?.textContent ?? null`));
  check("the client's setup shows its months and the total so far", charged === "4 months · $1,000 so far", charged);

  section("An annual term needs its end; one put in for a monthly one stops it");
  await admin.fill('[data-select-form] input[name="select_amount"]', "275");
  await admin.click('[data-select-mode="new"]');
  await admin.fill('[data-select-form] select[name="select_plan"]', "annual");
  // The renewal is prefilled; an annual one's end follows its start.
  const ends = await admin.ev(`document.querySelector('[data-select-form] input[name="select_ends"]')?.value`);
  check("a new annual term starts today and ends a year on, less a day", ends === addDays(addMonthsIso(today, 12), -1), ends);
  await admin.click('[data-select-mode="edit"]');

  section("The clients list");
  sql(`insert into public.select_terms (company_id, plan, amount, starts_on, ends_on) values
        (${ANNUAL}, 'annual', 2400, ${lit(addDays(today, -355))}, ${lit(addDays(today, 9))}),
        (${ENDED}, 'annual', 1200, ${lit(addDays(today, -366))}, ${lit(addDays(today, -1))})`);
  await admin.go(`/clients?rep=all`, 6000);
  const cells = await until(async () => {
    const r = await admin.ev(`Object.fromEntries([...document.querySelectorAll('[data-client-row]')].filter((tr) => tr.innerText.includes(${lit(TAG).replace(/^'|'$/g, '"')}))
      .map((tr) => [tr.dataset.clientRow, tr.querySelector('[data-select-cell]')?.innerText.replace(/\\s+/g, ' ').trim()]))`);
    return r && Object.keys(r).length === 3 ? r : null;
  }, { timeout: 15000 });
  check("a Client since and a Signature Select column", await admin.ev(`[...document.querySelectorAll('th')].map((t) => t.textContent).join('|')`).then((h) => h.includes("Client since") && h.includes("Signature Select") && !h.includes("End date")));
  check("…on it: the plan and amount; ended: says so", cells?.[MONTHLY] === "Monthly · $250/mo" && cells?.[ANNUAL]?.startsWith("Annual · $2,400/yr ends") && cells?.[ENDED] === "Ended", JSON.stringify(cells));

  section("The client's Sales Rep, a manager, ends it on Payments Due");
  const mike = await (await browser.newContext({ as: "mike@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await mike.go(`/payments`, 5000);
  const line = await until(() => mike.ev(`document.querySelector('[data-select-client="${MONTHLY}"]')?.textContent.replace(/\\s+/g, ' ') ?? null`).then((t) => (t?.includes("so far") ? t : null)), { timeout: 15000 });
  check("their client, its plan, months and total so far", Boolean(line?.includes("Monthly · $250/mo") && line.includes("4 months · $1,000 so far")), line);
  check("…not another rep's client", !(await mike.ev(`!!document.querySelector('[data-select-client="${ENDED}"]')`)));
  await mike.click(`[data-select-edit="${MONTHLY}"]`);
  await until(() => mike.ev(`!!document.querySelector('[data-select-dialog] input[aria-label="Signature Select ends"]')`));
  const last = addDays(today, 5);
  await mike.fill('[data-select-dialog] input[aria-label="Signature Select ends"]', `${Number(last.slice(5, 7))}/${Number(last.slice(8, 10))}/${last.slice(0, 4)}`);
  await mike.key("Enter");
  await until(() => mike.ev(`document.querySelector('[data-select-dialog] input[name="select_ends"]')?.value === ${JSON.stringify(last)}`));
  await mike.click("[data-select-dialog] button[type=submit]");
  const stopped = await until(() => sql(`select ends_on from public.select_terms where company_id = ${MONTHLY}`) || null, { timeout: 15000 });
  check("…puts in the day they stop: the term ends then", stopped === last, stopped);
  const seanSees = as(SEAN, `select count(*) from public.select_terms where company_id in (${companies})`);
  check("…another manager can't read its terms", seanSees === "0", seanSees);

  section("Two weeks before a term ends, its Sales Rep hears");
  const sent = sql(`select public.send_select_reminders(${lit(today)})`);
  const note = sql(`select title from public.notifications where user_id = ${MIKE} and title like ${lit(`%${TAG} Annual Ins%`)} order by id desc limit 1`);
  check("the Sales Rep is told the term is ending", Number(sent) >= 1 && note.startsWith("Signature Select ends"), `${sent} ${note}`);
  check("…once", sql(`select public.send_select_reminders(${lit(today)})`) === "0" || !sql(`select 1 from public.notifications where user_id = ${MIKE} and title like ${lit(`%${TAG} Annual Ins%`)} offset 1`));

  section("A client whose term has ended loses access");
  sql(`update public.users set company_id = ${ENDED} where id = ${CLIENT}`);
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await client.go(`/`, 5000);
  const ended = await until(() => client.ev(`document.querySelector('[data-select-ended]')?.innerText ?? null`), { timeout: 15000 });
  check("they see that their subscription has ended", Boolean(ended?.includes("Your Signature Select subscription has ended")), ended);
  const theirs = as(CLIENT, `select count(*) from public.projects where id = ${P}`);
  check("…and can't reach their projects", theirs === "0", theirs);
  sql(`insert into public.select_terms (company_id, plan, amount, starts_on, ends_on) values (${ENDED}, 'annual', 1300, ${lit(today)}, ${lit(addDays(addMonthsIso(today, 12), -1))})`);
  await client.go(`/`, 5000);
  check("renewed: their access is back", await until(async () => !(await client.ev(`!!document.querySelector('[data-select-ended]')`)) && (await client.ev(`!!document.querySelector('nav a[href="/"]')`))));

  section("The admin report");
  await admin.go(`/reports/select?all=1&client=${MONTHLY}`, 6000);
  const tiles = await until(async () => {
    const t = await admin.ev(`[...document.querySelectorAll('[data-select-tiles] [data-tile-value]')].map((e) => e.textContent)`);
    return t?.[0] === "$1,000" ? t : null;
  }, { timeout: 15000 });
  check("one client, all time: its total, monthly and annual", tiles?.[0] === "$1,000" && tiles?.[1] === "$1,000" && tiles?.[2] === "$0", JSON.stringify(tiles));
  check("…its charges, one a month", await admin.ev(`document.querySelectorAll('[data-select-charge]').length`) === 4);
  await admin.go(`/reports/select?from=${addDays(today, -400)}&to=${today}`, 6000);
  const byClient = await until(async () => {
    const r = await admin.ev(`Object.fromEntries([...document.querySelectorAll('[data-select-client]')].map((tr) => [tr.dataset.selectClient, tr.querySelector('[data-select-client-total]').textContent]))`);
    return r && r[ENDED] ? r : null;
  }, { timeout: 15000 });
  check("all clients, a time chosen: each client's total", byClient?.[MONTHLY] === "$1,000" && byClient?.[ANNUAL] === "$2,400" && byClient?.[ENDED] === "$2,500", JSON.stringify(byClient));
  check("…whose term ends in the next 30 days", Boolean(await admin.ev(`document.querySelector('[data-select-ending]')?.innerText.includes(${lit(`${TAG} Annual Ins`).replace(/^'|'$/g, '"')})`)));
  await admin.go(`/reports/select?from=${addDays(today, -10)}&to=${today}&client=${ANNUAL}`, 6000);
  check("…a time with no charge for that client: none", (await until(() => admin.ev(`document.querySelector('[data-select-charges]')?.innerText ?? null`)))?.includes("Nothing charged in this time."));
  const mikeReport = await mike.go(`/reports/select`, 5000).then(() => mike.ev(`!!document.querySelector('[data-select-report]')`));
  check("the report is the administrators' only", mikeReport === false);
} finally {
  browser.close();
  sql(`update public.users set company_id = ${clientCompany} where id = ${CLIENT}`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id in (${companies})`);
}

finish("signature select");
