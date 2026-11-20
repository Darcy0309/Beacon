/**
 * The administrator's top tiles (Sean, Nov 2026): a Sales Rep to show (their clients' leads, appointments and
 * active clients), and Conversion Rate by renewal month, this year against last: "how many appts did we set vs
 * leads that have/had a Jan renewal month … this year vs last year … all or by sales rep clients".
 *
 *   node tests/run.mjs tests/e2e/dashboard-conversion.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `DCV-TEST ${Date.now()}`;
const RACHEL = Number(sql(`select id from public.users where email = 'rachel@beacon.test'`));
const year = Number(sql(`select extract(year from public.business_today())::int`));
const type = (code) => sql(`select id from public.project_types where code = '${code}'`);
const company = (name, rep = "null") => Number(sql(`insert into public.companies (name, status, sales_rep_id) values (${lit(`${TAG} ${name}`)}, 'active', ${rep}) returning id`));
const MINE = company("Rachel's Client", RACHEL);
const OTHER = company("Someone Else's");
const project = (co) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts ${co}`)}, ${co}, ${type("APPT")}, 1) returning id`));
const P = project(MINE);
const Q = project(OTHER);
const result = sql(`select id from public.call_results where project_type = 'APPT' and name = 'Lead-No Contact'`);
// A lead renewing in `month`, developed long ago (closed out on `resolved`, if given).
const lead = (pid, name, month, resolved = null) => {
  const id = Number(sql(`insert into public.leads (company_name, project_id, stage, result_id, promoted_at, resolved_at)
    values (${lit(`${TAG} ${name}`)}, ${pid}, 'appt', ${result}, '${year - 3}-06-01', ${resolved ? lit(resolved) : "null"}) returning id`));
  sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${id}, '${year + 1}-${String(month).padStart(2, "0")}-15')`);
  return id;
};
const appt = (id, pid, setOn) => sql(`insert into public.appointments (lead_id, project_id, set_project_id, appt_date, appt_create_date)
  values (${id}, ${pid}, ${pid}, ${lit(setOn)}, ${lit(`${setOn}T12:00:00Z`)})`);
// Jan renewals on Rachel's client: this January's calling window runs from last September.
const L1 = lead(P, "Acme", 1);
const L2 = lead(P, "Best", 1);
const L3 = lead(P, "Cobalt", 1);
lead(P, "Long Gone", 1, `${year - 3}-07-01`); // closed out before either window
lead(P, "February One", 2);
appt(L1, P, `${year - 1}-11-10`); // this year's Jan
appt(L3, P, `${year}-01-05`);     // this year's Jan
appt(L2, P, `${year - 2}-10-05`); // last year's Jan
const L9 = lead(Q, "Elsewhere", 1);
appt(L9, Q, `${year - 1}-12-01`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  const tile = (label) => admin.ev(`(() => { const t = [...document.querySelectorAll('[data-panel]')].find((p) => p.querySelector('.stat-label')?.textContent.trim() === ${JSON.stringify(label)});
    return t ? { value: t.querySelector('[data-tile-value]')?.textContent.trim(), text: t.innerText.replace(/\\s+/g, ' ') } : null; })()`);

  section("Conversion by renewal month, for a Sales Rep's clients");
  await admin.go(`/?tr=${RACHEL}&rm=1&ry=${year}`, 8000);
  const conv = await until(async () => { const t = await tile("Conversion Rate"); return t?.value === "66.7%" ? t : null; }, { timeout: 20000 });
  check("Jan renewals this year: 2 of the 3 leads in the pipeline had an appointment set (one closed out long ago left out)", conv?.value === "66.7%", JSON.stringify(await tile("Conversion Rate")));
  check("…said, with last year's beside it", Boolean(conv?.text.includes(`2 of 3 · ${year - 1}: 33.3%`)) && (await admin.ev(`document.querySelector('[data-tile-menu="rm"]')?.textContent.trim()`)) === "Jan", conv?.text);
  check("a renewal month and a year to choose", await admin.ev(`!!document.querySelector('[data-tile-menu="rm"]') && !!document.querySelector('[data-tile-menu="ry"]')`));
  await admin.go(`/?tr=${RACHEL}&rm=1&ry=${year - 1}`, 8000);
  check("last year's Jan: 1 of 3", (await until(async () => { const t = await tile("Conversion Rate"); return t?.value === "33.3%" ? t : null; }, { timeout: 20000 }))?.value === "33.3%", JSON.stringify(await tile("Conversion Rate")));
  await admin.go(`/?tr=${RACHEL}&rm=2&ry=${year}`, 8000);
  check("February's: its own lead, none set", (await until(async () => { const t = await tile("Conversion Rate"); return t?.text.includes("0 of 1") ? t : null; }, { timeout: 20000 }))?.value === "0%", JSON.stringify(await tile("Conversion Rate")));

  section("The Sales Rep picker");
  await admin.go(`/?tr=${RACHEL}`, 8000);
  check("over the tiles, Rachel chosen", (await until(() => admin.ev(`document.querySelector('[data-tile-rep] [data-param="tr"]')?.textContent.trim() ?? null`))) === "Rachel Colestock");
  const clients = await tile("Active Clients");
  check("Active Clients: hers only", clients?.value === "1" && clients.text.includes("Their clients"), JSON.stringify(clients));
  check("Leads and Appointments: on her clients", (await tile("Leads"))?.text.includes("On their clients") && (await tile("Appointments"))?.text.includes("On their clients"));
  await admin.go(`/?rm=1&ry=${year}`, 8000);
  const all = await until(async () => { const t = await tile("Conversion Rate"); return t?.value ? t : null; }, { timeout: 20000 });
  const n = all?.text.match(/(\d+) of (\d+) ·/);
  check("everyone: every client's, the other client's Jan lead and its appointment too", n && Number(n[1]) >= 3 && Number(n[2]) >= 4, all?.text);
  check("…and Leads and Appointments say By managers", (await tile("Leads"))?.text.includes("By managers"));
} finally {
  browser.close();
  sql(`delete from public.appointments where project_id in (${P}, ${Q})`);
  sql(`delete from public.leads where project_id in (${P}, ${Q})`);
  sql(`delete from public.projects where id in (${P}, ${Q})`);
  sql(`delete from public.companies where id in (${MINE}, ${OTHER})`);
}

finish("dashboard conversion");
