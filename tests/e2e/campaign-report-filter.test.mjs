/**
 * Campaign Types phase 4 (Sean, Nov 2026: "dashboards/reports get a campaign-type filter, default Insurance, so IT
 * stats stay separate"): with a campaign type, the administrator's dashboard, Reports, X-Dates by Month and the
 * Production Heat Map count the Insurance clients to begin with, a campaign type's clients when it is chosen, or all.
 *
 *   node tests/run.mjs tests/e2e/campaign-report-filter.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CRF${Date.now()}`;
const SEAN = Number(sql(`select id from public.users where email = 'sean@beacon.test'`));
const typeId = Number(sql(`insert into public.campaign_types (name, fields) values (${lit(`IT ${TAG}`)}, '{}'::jsonb) returning id`));
const company = (name, type) => Number(sql(`insert into public.companies (name, status, campaign_type_id) values (${lit(`${TAG} ${name}`)}, 'active', ${type ?? "null"}) returning id`));
const IT = company("Tech Partners", typeId);
const INS = company("Capital Ins", null);
const project = (name, co) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name}`)}, ${co},
  (select id from public.project_types where code = 'APPT'), (select id from public.project_statuses where name = 'Active')) returning id`));
const PIT = project("IT Appts", IT);
const PINS = project("Ins Appts", INS);
// A renewal next month on each, for X-Dates by Month.
const MONTH = Number(sql(`select extract(month from public.business_today() + interval '1 month')::int`));
const RENEWS = sql(`select (date_trunc('month', public.business_today() + interval '1 month') + interval '9 days')::date::text`);
const lead = (name, pid) => {
  const id = Number(sql(`insert into public.leads (company_name, project_id, result_id) values (${lit(`${TAG} ${name}`)}, ${pid},
    (select id from public.call_results where project_type = 'APPT' and name = 'Lead-No Contact')) returning id`));
  sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${id}, '${RENEWS}')`);
  return id;
};
const LIT = lead("Acme Dental", PIT);
const LINS = lead("Hunsaker Trucking", PINS);
// Calls this week for the heat map: 30 on the IT lead, 20 on the insurance one.
const calls = (leadId, pid, n) => sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, call_result)
  select ${leadId}, ${pid}, ${SEAN}, now() - interval '1 day' + (i || ' seconds')::interval, 'x' from generate_series(1, ${n}) i`);
calls(LIT, PIT, 30);
calls(LINS, PINS, 20);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  const pickerSays = () => admin.ev(`document.querySelector('[data-campaign-picker] [data-param="ct"]')?.textContent.trim() ?? null`);

  section("The dashboard: Insurance to begin with");
  await admin.go("/", 9000);
  check("a Campaign type picker, on Insurance", (await until(pickerSays, { timeout: 20000 })) === "Insurance", await pickerSays());
  const active = () => admin.ev(`(() => { const t = [...document.querySelectorAll('[data-panel]')].find((p) => /Active Clients/.test(p.textContent)); return t?.querySelector('[data-tile-value]')?.textContent.trim() ?? null; })()`);
  await admin.go(`/?ct=${typeId}`, 9000);
  check("the campaign type chosen: its one client active", Boolean(await until(async () => (await active()) === "1", { timeout: 20000 })), await active());
  check("…the picker says so", (await pickerSays()) === `IT ${TAG}`, await pickerSays());
  await admin.go("/", 9000);
  const insActive = Number(await until(active, { timeout: 20000 }));
  const allActive = Number(sql(`select count(*) from public.companies where status = 'active' and deleted_at is null`));
  check("Insurance: every active client but it", Boolean(await until(async () => Number(await active()) === allActive - 1, { timeout: 15000 })), `${await active()} of ${allActive}`);
  void insActive;

  section("Reports");
  const billed = () => admin.ev(`[...document.querySelectorAll('[data-billing-row]')].map((r) => Number(r.dataset.billingRow))`);
  await admin.go("/reports", 9000);
  const insRows = await until(() => billed().then((b) => (b?.length ? b : null)), { timeout: 20000 });
  check("Insurance: the insurance client's project billed, not the IT one", insRows.includes(PINS) && !insRows.includes(PIT), JSON.stringify(insRows.filter((x) => [PIT, PINS].includes(x))));
  await admin.go(`/reports?ct=${typeId}`, 9000);
  const itRows = await until(() => billed().then((b) => (b?.length ? b : null)), { timeout: 20000 });
  check("the campaign type: its project only", JSON.stringify(itRows) === JSON.stringify([PIT]), JSON.stringify(itRows));
  await admin.go("/reports?ct=all", 9000);
  const allRows = await until(() => billed().then((b) => (b?.length ? b : null)), { timeout: 20000 });
  check("All: both", allRows.includes(PIT) && allRows.includes(PINS));

  section("X-Dates by Month");
  const names = () => admin.ev(`document.querySelector('#names')?.innerText ?? null`);
  await admin.go(`/reports/x-dates?month=${MONTH}`, 9000);
  const ins = await until(names, { timeout: 20000 });
  check("Insurance: the insurance renewal, not the IT one", ins.includes("Hunsaker Trucking") && !ins.includes("Acme Dental"), ins?.slice(0, 300));
  await admin.go(`/reports/x-dates?month=${MONTH}&ct=${typeId}`, 9000);
  const it = await until(names, { timeout: 20000 });
  check("the campaign type: its renewal only", it.includes("Acme Dental") && !it.includes("Hunsaker Trucking"), it?.slice(0, 300));
  check("…its months' links keep it", (await admin.ev(`[...document.querySelectorAll('a[href*="/reports/x-dates?"]')].some((a) => a.getAttribute('href').includes('ct=${typeId}'))`)) === true);

  section("The Production Heat Map");
  const total = () => admin.ev(`document.querySelector('[data-best-total]')?.textContent ?? null`);
  await admin.go(`/reports/heat-map?ct=${typeId}`, 9000);
  check("the campaign type: its 30 calls", /^30 calls/.test((await until(total, { timeout: 20000 })) ?? ""), await total());
  await admin.go(`/reports/heat-map?ct=${typeId}&client=${INS}`, 9000);
  check("…none of the insurance client's", /^0 calls/.test((await until(total, { timeout: 20000 })) ?? "") || /No calls/.test(await admin.ev(`document.querySelector('[data-best-times]')?.innerText ?? ''`)), await total());
} finally {
  browser.close();
  sql(`delete from public.call_records where project_id in (${PIT}, ${PINS})`);
  sql(`delete from public.leads where project_id in (${PIT}, ${PINS})`);
  sql(`delete from public.projects where id in (${PIT}, ${PINS})`);
  sql(`delete from public.companies where id in (${IT}, ${INS})`);
  sql(`delete from public.campaign_types where id = ${typeId}`);
}

finish("campaign report filter");
