/**
 * A client's removal list (Oct 2026): a client's people tick names they
 * don't want off a project's list, or take one off from its lead sheet,
 * with why (Deletion unless they say); the names are remembered for the
 * lists pulled later. A name given back a callable result is forgotten
 * again; one marked Removed because it was moved to another of the
 * client's projects is not a removal. Administrators see the list on the
 * client's page and can take a name off it.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/client-removals.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { clientSlug } from "../../src/lib/format.js";

const TAG = `REMOVALS-E2E ${Date.now()}`;
const [clientUser, company, companyName] = sql(`select u.id || '|' || u.company_id || '|' || c.name from public.users u join public.companies c on c.id = u.company_id
  where u.email = 'client@beacon.test'`).split("|");
const dbdv = `(select id from public.project_types where code = 'DBDV')`;
const projectA = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} A`)}, ${company}, ${dbdv}, 1) returning id`));
const projectB = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} B`)}, ${company}, ${dbdv}, 1) returning id`));
const viable = `public.call_result_from_text('DBDV', 'Viable-CallBack')`;
const lead = (name, phone, project = projectA) => Number(sql(`insert into public.leads (project_id, company_name, phone, city, zip, result_id)
  values (${project}, ${lit(`${TAG} ${name}`)}, ${lit(phone)}, 'Appleton', '54911', ${viable}) returning id`));
const one = lead("One", "920-555-1001");
const two = lead("Two", "920-555-1002");
const three = lead("Three", "920-555-1003");
const result = (id) => sql(`select r.name from public.leads l join public.call_results r on r.id = l.result_id where l.id = ${id}`);
const entry = (id) => sql(`select reason || '|' || coalesce(note, '') || '|' || coalesce(removed_by::text, '') from public.client_removals where lead_id = ${id}`);

const browser = await launchBrowser();
try {
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });

  section("Ticking names off a project's list");
  await client.go(`/projects/${projectA}`, 5000);
  check("a client's people get the bar to take names off", Boolean(await until(() => client.ev(`Boolean(document.querySelector('[data-mark-bar]'))`))));
  await client.click(`[data-pick="${one}"]`);
  await client.click("[data-mark-open]");
  await until(() => client.ev(`Boolean(document.querySelector('[data-mark-dialog]'))`));
  check("Deletion is chosen unless they say", await client.ev(`document.querySelector('[data-mark-reason="deletion"]').checked`));
  await client.click('[data-mark-reason="dont_call"]');
  await client.fill("[data-mark-note]", "asked us not to call");
  await client.click("[data-mark-go]");
  const said = await client.waitToast(/taken off/, 10000);
  check("it says so", /1 name taken off · Don't call/.test(said ?? ""), said);
  check("the name is Do Not Call", await until(() => result(one) === "DoNotCall"), result(one));
  check("…and on the client's list, with the note and who", entry(one) === `dont_call|asked us not to call|${clientUser}`, entry(one));
  check("…its notes say so", /Taken off the list by .*: Don't call \(asked us not to call\)/.test(sql(`select notes from public.lead_notes where lead_id = ${one}`)));

  section("From a lead sheet");
  await client.go(`/leads/${two}`, 5000);
  await client.click("[data-mark-lead]");
  await until(() => client.ev(`Boolean(document.querySelector('[data-mark-dialog]'))`));
  await client.click("[data-mark-go]");
  await client.waitToast(/taken off/, 10000);
  check("taken off as a Deletion, the result Removed", await until(() => result(two) === "Removed") && entry(two).startsWith("deletion|"), `${result(two)} / ${entry(two)}`);

  section("Results given by staff, and put right");
  sql(`update public.leads set result_id = public.call_result_from_text('DBDV', 'Client') where id = ${three}`);
  check("a name staff mark Client is a current customer on the list", entry(three).startsWith("current_customer|"), entry(three));
  sql(`update public.leads set result_id = ${viable} where id = ${three}`);
  check("…given a callable result again, it is off the list", entry(three) === "", entry(three));
  // A move: the copy on the client's other project first, then the original marked Removed (move_names).
  lead("Three", "920-555-1003", projectB);
  sql(`update public.leads set result_id = public.call_result_from_text('DBDV', 'Removed') where id = ${three}`);
  check("a name Removed because it moved to another of the client's projects is not a removal", entry(three) === "", entry(three));

  section("Only their own names");
  const other = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Other Co`)}) returning id`));
  const otherProject = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Other`)}, ${other}, ${dbdv}, 1) returning id`));
  const theirs = lead("Theirs", "920-555-1009", otherProject);
  // As the client's own session would call it.
  const auth = sql(`select auth_id from public.users where id = ${clientUser}`);
  let refused = "";
  try {
    sql(`begin; set local role authenticated;
      select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: auth, role: "authenticated", aal: "aal2" }))}, true);
      select public.mark_names(array[${theirs}]::bigint[], 'deletion'); commit;`);
  } catch (e) {
    refused = String(e.stderr ?? e.message);
  }
  check("a client can't take another client's names off", /not on your lists/.test(refused), refused.trim().slice(0, 160));
  check("…which stay as they are", result(theirs) === "Viable-CallBack", result(theirs));

  section("Leads in their appointment pipeline");
  // Sean's client (Oct 2026): leads they no longer want called for appointments come off as Lead-Removed, still in the reports.
  const appt = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company},
    (select id from public.project_types where code = 'APPT'), 1) returning id`));
  const apptLead = (name, phone, res) => Number(sql(`insert into public.leads (project_id, company_name, phone, city, zip, result_id)
    values (${appt}, ${lit(`${TAG} ${name}`)}, ${lit(phone)}, 'Appleton', '54911', public.call_result_from_text('APPT', ${lit(res)})) returning id`));
  const pipeline = apptLead("Pipeline", "920-555-1011", "Lead-Left Message");
  const corrected = apptLead("Corrected", "920-555-1012", "Lead-Corrected");
  const booked = apptLead("Booked", "920-555-1013", "Appointment");
  const leadsBefore = sql(`select leads_active + leads_resolved from public.lead_stats(null, ${appt})`);
  let apptOut = "";
  try {
    apptOut = sql(`begin; set local role authenticated;
      select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: auth, role: "authenticated", aal: "aal2" }))}, true);
      select public.mark_names(array[${pipeline}, ${corrected}, ${booked}]::bigint[], 'deletion'); commit;`);
  } catch (e) {
    apptOut = String(e.stderr ?? e.message);
  }
  check("leads in the pipeline come off, the appointment stays", /"kept": 1/.test(apptOut) && /"marked": 2/.test(apptOut), apptOut.trim().slice(0, 160));
  check("…as Lead-Removed, an X-date corrected or not", result(pipeline) === "Lead-Removed" && result(corrected) === "Lead-Removed", `${result(pipeline)} / ${result(corrected)}`);
  check("…the appointment as it was", result(booked) === "Appointment", result(booked));
  check("…still counted as leads in the reports", sql(`select leads_active + leads_resolved from public.lead_stats(null, ${appt})`) === leadsBefore);
  check("…and on the client's list for later lists", sql(`select count(*) from public.client_removals where lead_id in (${pipeline}, ${corrected})`) === "2");
  sql(`delete from public.client_removals where lead_id in (select id from public.leads where project_id = ${appt})`);
  sql(`delete from public.lead_notes where lead_id in (select id from public.leads where project_id = ${appt})`);
  sql(`delete from public.leads where project_id = ${appt}`);
  sql(`delete from public.projects where id = ${appt}`);

  section("The client's page");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await admin.go(`/clients/${clientSlug(companyName)}`, 6000);
  const shown = await until(() => admin.ev(`[...document.querySelectorAll('[data-removal]')].map((r) => r.textContent).join(' / ')`).then((t) => t.includes(`${TAG} One`) && t));
  check("administrators see the removal list, with why", Boolean(shown) && /Don't call/.test(shown) && shown.includes(`${TAG} Two`), shown);
  const id = sql(`select id from public.client_removals where lead_id = ${two}`);
  await admin.click(`[data-removal-forget="${id}"]`);
  await admin.waitToast(/off the removal list/, 8000);
  check("…and take a name off it", await until(() => sql(`select count(*) from public.client_removals where id = ${id}`) === "0"));
  sql(`delete from public.leads where project_id = ${otherProject}`);
  sql(`delete from public.projects where id = ${otherProject}`);
  sql(`delete from public.companies where id = ${other}`);
} finally {
  browser.close();
  sql(`delete from public.client_removals where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.lead_notes where lead_id in (select id from public.leads where project_id in (${projectA}, ${projectB}))`);
  sql(`delete from public.leads where project_id in (${projectA}, ${projectB})`);
  sql(`delete from public.projects where id in (${projectA}, ${projectB})`);
  sql(`delete from public.activity_log where created_at > now() - interval '10 minutes' and action in ('lead.removed', 'client.removal_forgotten')`);
}

finish("client removals");
