/**
 * Giving a lead to another client, and moving names between projects (Sean,
 * Oct 2026). A lead client A can't use: Transfer shows the same business on
 * another client's list and the clients whose office is near it (miles from
 * its ZIP, the far one left out); transferring makes a Lead-No Contact copy
 * there (its details, coverage, and client notes in the internal notes; no
 * pay), marks the original Lead-Removed and opens the copy. "Use this
 * record" puts the one already on the other list back on it. Names ticked on
 * a project move to another of its kind, shared out among its reps; one
 * whose phone is there already stays; the originals are marked Moved.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `TR-TEST ${Date.now()}`;
const one = (q) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${q}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const ADMIN = userId("admin@beacon.test");
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const result = (type, name) => Number(sql(`select id from public.call_results where project_type='${type}' and name=${lit(name)}`));
const company = (name) => Number(sql(`insert into public.companies (name) values (${lit(`${TAG} ${name}`)}) returning id`));
const project = (co, name, type, zip, city) => Number(sql(`insert into public.projects (company_id, name, project_type_id, status_id, zip, city, state)
  values (${co}, ${lit(`${TAG} ${name}`)}, (select id from public.project_types where code='${type}'), 1, '${zip}', '${city}', 'AZ') returning id`));
const lead = (pid, name, phone, res, extra = "") => Number(sql(`insert into public.leads (project_id, company_name, phone, zip, city, state, result_id, assigned_user_id${extra ? ", client_note" : ""})
  values (${pid}, ${lit(`${TAG} ${name}`)}, '${phone}', '85201', 'Mesa', 'AZ', ${res}, null${extra ? `, ${lit(extra)}` : ""}) returning id`));

const A = company("Alpha Insurance"), B = company("Bravo Insurance"), C = company("Charlie Insurance");
const PA = project(A, "Alpha Appts", "APPT", "85201", "Mesa");
const PB = project(B, "Bravo Appts", "APPT", "85281", "Tempe");
const PC = project(C, "Charlie Appts", "APPT", "10001", "New York");
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${PB}, ${SEAN}), (${PC}, ${MIKE})`);
const NO_CONTACT = result("APPT", "Lead-No Contact");
const L1 = lead(PA, "Desert Glass", "480-555-0101", NO_CONTACT, "Wants a call after 3pm");
sql(`insert into public.insurance_details (lead_id, ultimate_xdate, wc_carrier) values (${L1}, '2027-01-15', 'Hartford')`);
sql(`insert into public.lead_notes (lead_id, notes) values (${L1}, 'Owner is Pat')`);
const L2 = lead(PA, "Mesa Plumbing", "480-555-0102", NO_CONTACT);
const M2 = lead(PC, "Mesa Plumbing", "(480) 555-0102", result("APPT", "Lead-Not Qualified"));
// Viable names on a DB dev project, and another to move them to (two reps; one name already there).
const D = company("Delta Insurance");
const PD1 = project(D, "Delta DBDev", "DBDV", "85201", "Mesa");
const PD2 = project(D, "Delta DBDev 2", "DBDV", "85201", "Mesa");
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${PD2}, ${SEAN}), (${PD2}, ${MIKE})`);
const CALLBACK = result("DBDV", "Viable-CallBack");
const V = [1, 2, 3].map((i) => lead(PD1, `Viable ${i}`, `602-555-010${i}`, CALLBACK));
lead(PD2, "Viable 3 elsewhere", "602-555-0103", CALLBACK);

const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 25000) => until(() => page.ev(expr), { timeout });
const setSelect = (page, sel, value) => page.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("Transfer a lead to another client");
  await admin.go(`/leads/${L1}`, 8000);
  await when(admin, "!!document.querySelector('[data-transfer-lead]')", 30000);
  await admin.ev("document.querySelector('[data-transfer-lead]').click()");
  await when(admin, "!!document.querySelector('[data-transfer-nearby]')");
  const near = await admin.ev(`[...document.querySelectorAll('[data-transfer-near]')].map((li) => li.dataset.transferNear + ':' + li.querySelector('[data-transfer-miles-away]').textContent).join(',')`);
  check("clients nearby: Bravo's Tempe office, in miles from the lead's ZIP; Charlie's New York one not", near.includes(`${PB}:`) && !near.includes(`${PC}:`) && /\b[5-8] mi/.test(near), near);
  await admin.ev(`document.querySelector('[data-transfer-to="${PB}"]').click()`);
  const N1 = Number(await when(admin, `(() => { const m = location.pathname.match(/^\\/leads\\/(\\d+)$/); return m && m[1] !== '${L1}' ? m[1] : null; })()`));
  check("transferred: the new record opens", N1 > 0, await admin.url());
  const n1 = one(`select l.project_id, r.name as result, l.assigned_user_id, l.company_name, l.client_note, n.notes, i.ultimate_xdate, i.wc_carrier
    from public.leads l join public.call_results r on r.id = l.result_id left join public.lead_notes n on n.lead_id = l.id left join public.insurance_details i on i.lead_id = l.id where l.id = ${N1}`);
  check("…on Bravo's project as Lead-No Contact, given to its rep", n1.project_id === PB && n1.result === "Lead-No Contact" && n1.assigned_user_id === SEAN, JSON.stringify(n1));
  check("…its details and coverage copied", n1.company_name === `${TAG} Desert Glass` && n1.ultimate_xdate === "2027-01-15" && n1.wc_carrier === "Hartford");
  check("…client notes in the internal notes, the client notes box left to write", /Transferred here from .*Alpha Appts/.test(n1.notes) && /Owner is Pat/.test(n1.notes)
    && /Client notes from that record:\nWants a call after 3pm/.test(n1.notes) && n1.client_note === null, n1.notes);
  const o1 = one(`select r.name as result, n.notes from public.leads l join public.call_results r on r.id = l.result_id left join public.lead_notes n on n.lead_id = l.id where l.id = ${L1}`);
  check("the original is Lead-Removed, its notes saying where it went", o1.result === "Lead-Removed" && /Transferred to .*Bravo Appts/.test(o1.notes), JSON.stringify(o1));
  check("no pay for it", sql(`select count(*) from public.pay_events where lead_id in (${L1}, ${N1})`) === "0");

  section("The same business already on another client's list");
  await admin.go(`/leads/${L2}`, 8000);
  await when(admin, "!!document.querySelector('[data-transfer-lead]')", 30000);
  await admin.ev("document.querySelector('[data-transfer-lead]').click()");
  check("found there by its phone", Boolean(await when(admin, `!!document.querySelector('[data-transfer-match="${M2}"]')`)));
  await admin.ev(`document.querySelector('[data-transfer-into="${M2}"]').click()`);
  check("…that record opens", Boolean(await when(admin, `location.pathname === '/leads/${M2}'`)));
  const m2 = one(`select r.name as result, l.assigned_user_id, n.notes from public.leads l join public.call_results r on r.id = l.result_id left join public.lead_notes n on n.lead_id = l.id where l.id = ${M2}`);
  check("…back on that list as Lead-No Contact, with its rep", m2.result === "Lead-No Contact" && m2.assigned_user_id === MIKE && /Transferred here from/.test(m2.notes), JSON.stringify(m2));
  check("…and the original Lead-Removed", sql(`select r.name from public.leads l join public.call_results r on r.id = l.result_id where l.id = ${L2}`) === "Lead-Removed");

  section("Move names to another project");
  await admin.go(`/projects/${PD1}`, 8000);
  await when(admin, "!!document.querySelector('[data-move-bar]')", 30000);
  await admin.ev("document.querySelector('[data-pick-matching]').click()");
  check("all that match picked", Boolean(await when(admin, "document.querySelector('[data-picked-count]')?.textContent === '3'")));
  await admin.ev("document.querySelector('[data-move-open]').click()");
  await when(admin, `!!document.querySelector('[data-move-target] option[value="${PD2}"]')`);
  check("…to DB dev projects only, the result to start with a DB dev one", !(await admin.ev(`!!document.querySelector('[data-move-target] option[value="${PB}"]')`))
    && (await admin.ev("document.querySelector('[data-move-result]').selectedOptions[0].textContent")) === "Viable-CallBack");
  await setSelect(admin, "[data-move-target]", PD2);
  await admin.ev("document.querySelector('[data-move-go]').click()");
  check("moved: said, with the one already there", Boolean(await when(admin, `[...document.querySelectorAll('[data-sonner-toast]')].some((t) => /2 names moved/.test(t.textContent) && /1 already on that project/.test(t.textContent))`)));
  const there = JSON.parse(sql(`select coalesce(json_agg(json_build_object('rep', assigned_user_id, 'result', result_id)), '[]') from public.leads where project_id = ${PD2} and company_name in (${lit(`${TAG} Viable 1`)}, ${lit(`${TAG} Viable 2`)})`));
  check("…copied there as Viable-CallBack, one to each rep", there.length === 2 && there.every((t) => t.result === CALLBACK) && new Set(there.map((t) => t.rep)).size === 2, JSON.stringify(there));
  // Moved within the client (Oct 2026): still being called there, so not a removal.
  check("…the originals Moved, the one already there left as it was",
    sql(`select string_agg(r.name, ',' order by l.id) from public.leads l join public.call_results r on r.id = l.result_id where l.id in (${V.join(",")})`) === "Moved,Moved,Viable-CallBack");
  check("…and the copies count for the project they went to", sql(`select count(*) from public.leads where project_id = ${PD2} and source_project_id = ${PD2}
    and company_name in (${lit(`${TAG} Viable 1`)}, ${lit(`${TAG} Viable 2`)})`) === "2");
} finally {
  browser.close();
  const projects = [PA, PB, PC, PD1, PD2].join(",");
  sql(`delete from public.lead_notes where lead_id in (select id from public.leads where project_id in (${projects}))`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where project_id in (${projects}))`);
  sql(`delete from public.leads where project_id in (${projects})`);
  sql(`delete from public.project_assignments where project_id in (${projects})`);
  sql(`delete from public.projects where id in (${projects})`);
  sql(`delete from public.companies where id in (${[A, B, C, D].join(",")})`);
}

finish("transfer");
