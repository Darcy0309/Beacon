/**
 * Changing call results in bulk (Sean, Oct 2026: the old Result Change),
 * on a project's list: narrowed by the names' data (employees, SIC, state)
 * and sorted; names a client no longer wants (under 5 employees) picked and
 * made Removed; then every Removed one put back to Viable-CallBack, shared
 * out to the project's reps again. No call recorded, a note on each.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `RC-TEST ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test"), MIKE = userId("mike@beacon.test");
const result = (name) => Number(sql(`select id from public.call_results where project_type='DBDV' and name=${lit(name)}`));
const CALLBACK = result("Viable-CallBack"), REMOVED = result("Removed");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const P = Number(sql(`insert into public.projects (company_id, name, project_type_id, status_id) values (${company}, ${lit(`${TAG} DBDev`)}, (select id from public.project_types where code='DBDV'), 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${P}, ${SEAN}), (${P}, ${MIKE})`);
// [name, employees, sic, state, result]
const NAMES = [["Tiny Tile", "3", "1743", "AZ", CALLBACK], ["Four Roofs", "4", "1761", "AZ", CALLBACK], ["Ten Paint", "10", "1721", "NM", CALLBACK],
  ["Big Builders", "25", "1521", "AZ", CALLBACK], ["Two Movers", "2", "4212", "AZ", CALLBACK], ["Unknown Size", "", "1521", "NM", CALLBACK],
  ["Old Removed A", "8", "7342", "AZ", REMOVED], ["Old Removed B", "40", "7342", "AZ", REMOVED]];
const id = {};
for (const [n, emp, sic, st, res] of NAMES) {
  id[n] = Number(sql(`insert into public.leads (project_id, company_name, employees, sic_code, state, result_id, assigned_user_id)
    values (${P}, ${lit(`${TAG} ${n}`)}, ${emp ? lit(emp) : "null"}, '${sic}', '${st}', ${res}, ${res === CALLBACK ? SEAN : "null"}) returning id`));
}
const resultOf = (n) => sql(`select r.name from public.leads l join public.call_results r on r.id = l.result_id where l.id = ${id[n]}`);

const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 25000) => until(() => page.ev(expr), { timeout });
const rowsShown = (page) => page.ev(`[...document.querySelectorAll('[data-pick]')].map((b) => b.closest('tr').querySelector('a').textContent.replace(${JSON.stringify(`${TAG} `)}, '')).join(',')`);
const setSelect = (page, sel, value) => page.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("Narrowed and sorted by the names' data");
  await admin.go(`/projects/${P}`, 8000);
  await when(admin, "!!document.querySelector('[data-name-filters]')", 30000);
  check("the list shows each name's place, SIC and employees", await admin.ev(`[...document.querySelectorAll('[data-employees]')].map((c) => c.textContent).includes('25')`));
  // Applied in place: the list comes again, not the whole page (the mark set here would go with a reload).
  await admin.ev("window.__stayed = true");
  await admin.ev(`(() => { const el = document.querySelector('[data-filter-emp-max]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '4'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await admin.ev("document.querySelector('[data-filter-apply]').click()");
  await when(admin, "location.search.includes('emp_max=4') && document.querySelectorAll('[data-pick]').length === 3");
  await setSelect(admin, "[data-filter-sort]", "employees");
  await when(admin, "location.search.includes('sort=employees')");
  const small = await when(admin, `(() => { const r = ${"[...document.querySelectorAll('[data-pick]')]"}; return r.length === 3 ? r.map((b) => b.closest('tr').querySelector('a').textContent).join(',') : null; })()`);
  check("employees up to 4, fewest first", small === `${TAG} Two Movers,${TAG} Tiny Tile,${TAG} Four Roofs`, small);
  check("…applied without reloading the page", (await admin.ev("window.__stayed === true")) === true);
  await admin.go(`/projects/${P}?sic=15`, 8000);
  await when(admin, "!!document.querySelector('[data-name-filters]')");
  check("an SIC code's start: 15 is construction", (await rowsShown(admin)).split(",").sort().join() === "Big Builders,Unknown Size", await rowsShown(admin));
  await admin.go(`/projects/${P}?state=NM&sort=employees_desc`, 8000);
  await when(admin, "!!document.querySelector('[data-name-filters]')");
  check("a state, most employees first (none known last)", (await rowsShown(admin)) === "Ten Paint,Unknown Size", await rowsShown(admin));

  section("A client wants none under 5 employees");
  await admin.go(`/projects/${P}?emp_max=4&result=${CALLBACK}`, 8000);
  await when(admin, "!!document.querySelector('[data-pick-matching]')");
  await admin.ev("document.querySelector('[data-pick-matching]').click()");
  check("all that match picked", Boolean(await when(admin, "document.querySelector('[data-picked-count]')?.textContent === '3'")));
  await admin.ev("document.querySelector('[data-change-open]').click()");
  await when(admin, "!!document.querySelector('[data-change-result]')");
  check("only results a name can stand on are offered", await admin.ev(`(() => { const o = [...document.querySelector('[data-change-result]').options].map((x) => x.textContent); return o.includes('Removed') && o.includes('Viable-CallBack') && !o.includes('Lead') && !o.includes('Appointment'); })()`));
  await setSelect(admin, "[data-change-result]", REMOVED);
  await admin.ev("document.querySelector('[data-change-go]').click()");
  check("changed, and said", Boolean(await when(admin, `[...document.querySelectorAll('[data-sonner-toast]')].some((t) => /3 names changed to Removed/.test(t.textContent))`)));
  check("…those three Removed, the rest as they were", ["Tiny Tile", "Four Roofs", "Two Movers"].every((n) => resultOf(n) === "Removed") && resultOf("Ten Paint") === "Viable-CallBack" && resultOf("Big Builders") === "Viable-CallBack");
  check("…a note on each, no call recorded", /Call result changed from Viable-CallBack to Removed/.test(sql(`select notes from public.lead_notes where lead_id = ${id["Tiny Tile"]}`))
    && sql(`select count(*) from public.call_records where lead_id in (${Object.values(id).join(",")})`) === "0");

  section("Every Removed one back to Viable");
  await admin.go(`/projects/${P}?result=${REMOVED}`, 8000);
  await when(admin, "!!document.querySelector('[data-pick-matching]')");
  await admin.ev("document.querySelector('[data-pick-matching]').click()");
  check("the five Removed picked", Boolean(await when(admin, "document.querySelector('[data-picked-count]')?.textContent === '5'")));
  await admin.ev("document.querySelector('[data-change-open]').click()");
  await when(admin, "!!document.querySelector('[data-change-result]')");
  await setSelect(admin, "[data-change-result]", CALLBACK);
  await admin.ev("document.querySelector('[data-change-go]').click()");
  check("changed back", Boolean(await when(admin, `[...document.querySelectorAll('[data-sonner-toast]')].some((t) => /5 names changed to Viable-CallBack/.test(t.textContent))`)));
  const back = JSON.parse(sql(`select json_agg(json_build_object('r', result_id, 'rep', assigned_user_id, 'resolved', resolved_at)) from public.leads where project_id = ${P}`));
  check("…all eight viable, none resolved, shared out to both reps evenly", back.every((x) => x.r === CALLBACK && !x.resolved && x.rep)
    && back.filter((x) => x.rep === SEAN).length === 4 && back.filter((x) => x.rep === MIKE).length === 4, JSON.stringify(back));
} finally {
  browser.close();
  sql(`delete from public.lead_notes where lead_id in (select id from public.leads where project_id = ${P})`);
  sql(`delete from public.leads where project_id = ${P}`);
  sql(`delete from public.project_assignments where project_id = ${P}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("result change");
