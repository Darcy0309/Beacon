/**
 * Campaign Types (Sean, Nov 2026): an administrator builds a lead sheet for another industry in Settings (the
 * insurance fields renamed or turned off, and fields of its own), gives a client that type, and the client's leads
 * show it, to staff and to the client. What a field turned off holds is kept through a save; the answers to the
 * type's own fields are saved, checked by kind.
 *
 *   node tests/run.mjs tests/e2e/campaign-types.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { SERVICE_ROLE_KEY, SUPABASE_URL } from "../support/env.mjs";

const TAG = `CT${Date.now()}`;
const NAME = `IT ${TAG}`;
const CLIENT = Number(sql(`select id from public.users where email = 'client@beacon.test'`));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id = ${CLIENT}`);
const co = Number(sql(`insert into public.companies (name, status) values (${lit(`${TAG} Tech Partners`)}, 'active') returning id`));
const slug = `${TAG} Tech Partners`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} DBDev`)}, ${co},
  (select id from public.project_types where code = 'DBDV'), 1) returning id`));
const LEAD = Number(sql(`insert into public.leads (company_name, project_id, phone, xmod, dot_number) values (${lit(`${TAG} Acme Dental`)}, ${P}, '6025550101', 0.9, '777') returning id`));
sql(`insert into public.insurance_details (lead_id, ultimate_xdate, wc_xdate, wc_carrier) values (${LEAD}, '2027-04-01', '2027-02-01', 'Travelers')`);
sql(`update public.users set company_id = ${co} where id = ${CLIENT}`);
const custom = () => sql(`select custom::text from public.leads where id = ${LEAD}`);

const browser = await launchBrowser();
let typeId = null;
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("Built in Settings");
  await admin.go("/settings/leads", 6000);
  await admin.ev(`document.querySelector('[data-campaign-types]')?.scrollIntoView()`);
  check("Settings has Campaign Types, Insurance built in", Boolean(await until(() => admin.ev(`!!document.querySelector('[data-campaign-type="insurance"]')`))));
  await admin.click("[data-new-campaign-type]");
  await until(() => admin.ev(`!!document.querySelector('[data-campaign-type-form]')`));
  await admin.fill("[data-campaign-type-name]", NAME);
  await admin.fill('[data-builtin-label="ultimate_xdate"]', "Contract renewal");
  await admin.fill('[data-builtin-label="tab_coverage"]', "Systems");
  for (const key of ["xmod", "dot_number", "cargo", "line_wc"]) await admin.click(`[data-builtin-show="${key}"]`);
  await admin.click("[data-custom-add]");
  await admin.fill('[data-custom-field="0"] [data-custom-label]', "Desktops");
  await admin.fill('[data-custom-field="0"] [data-custom-type]', "number");
  await admin.click("[data-custom-add]");
  await admin.fill('[data-custom-field="1"] [data-custom-label]', "Cloud / hosting");
  await admin.fill('[data-custom-field="1"] [data-custom-type]', "select");
  await until(() => admin.ev(`!!document.querySelector('[data-custom-field="1"] [data-custom-options]')`));
  await admin.fill('[data-custom-field="1"] [data-custom-options]', "Azure, AWS, Google Cloud");
  await admin.click("[data-campaign-type-form] button[type=submit]");
  const saved = await until(() => sql(`select fields::text from public.campaign_types where name = ${lit(NAME)}`) || null, { timeout: 15000 });
  typeId = Number(sql(`select id from public.campaign_types where name = ${lit(NAME)}`));
  const f = JSON.parse(saved ?? "{}");
  check("saved: the key date and the tab renamed, four parts off, two fields of its own",
    f.builtin?.ultimate_xdate?.label === "Contract renewal" && f.builtin?.tab_coverage?.label === "Systems"
      && ["xmod", "dot_number", "cargo", "line_wc"].every((k) => f.builtin?.[k]?.hidden) && f.custom?.length === 2 && f.custom[1].options?.length === 3, saved);

  section("Given to a client");
  await admin.go(`/clients/${slug}`, 5000);
  await admin.click("[data-edit-client]");
  await until(() => admin.ev(`!!document.querySelector('[data-campaign-type-select]')`));
  await admin.fill("[data-campaign-type-select]", String(typeId));
  await admin.click("[data-client-form] button[type=submit]");
  check("the client's campaign type saved", Boolean(await until(() => sql(`select campaign_type_id from public.companies where id = ${co}`) === String(typeId), { timeout: 15000 })));

  section("Its lead, for staff");
  await admin.go(`/leads/${LEAD}`, 6000);
  const tabs = await until(() => admin.ev(`[...document.querySelectorAll('[role=tab]')].map((t) => t.textContent.trim())`).then((t) => (t?.length ? t : null)));
  check("Business and Systems (Coverage renamed)", tabs.includes("Systems") && !tabs.includes("Coverage"), JSON.stringify(tabs));
  const business = await admin.ev(`[...document.querySelectorAll('[role=tabpanel]')].find((p) => p.offsetParent !== null && p.closest('[data-tabs], div'))?.innerText ?? ''`);
  check("the Business tab: its own fields, not XMOD, DOT# or Cargo", business.includes("Desktops") && business.includes("Cloud / hosting") && !/XMOD|DOT#|Cargo/.test(business), business.slice(0, 400));

  section("Edited");
  await admin.click("[data-edit-business]");
  await until(() => admin.ev(`!!document.querySelector('[data-business-form] [data-group="custom"]')`));
  check("the form: its own fields, not XMOD", await admin.ev(`!document.querySelector('[data-business-form] input[name="xmod"]') && !document.querySelector('[data-business-form] input[name="dot_number"]')`));
  const ids = JSON.parse(saved).custom.map((c) => c.id);
  await admin.fill(`[data-business-form] input[name="custom.${ids[0]}"]`, "lots");
  await admin.click("[data-business-form] button[type=submit]");
  check("a number that isn't one: refused", Boolean(await until(() => admin.ev(`/Desktops: enter a number/.test(document.querySelector('[data-business-form]')?.innerText ?? '')`))));
  await admin.fill(`[data-business-form] input[name="custom.${ids[0]}"]`, "42");
  await admin.fill(`[data-business-form] select[name="custom.${ids[1]}"]`, "AWS");
  await admin.click("[data-business-form] button[type=submit]");
  const answers = await until(() => { const c = JSON.parse(custom() || "{}"); return c[ids[0]] === 42 ? c : null; }, { timeout: 15000 });
  check("its answers saved", answers?.[ids[0]] === 42 && answers?.[ids[1]] === "AWS", custom());
  check("…what XMOD and DOT# hold kept", sql(`select xmod || '|' || dot_number from public.leads where id = ${LEAD}`) === "0.90|777", sql(`select xmod || '|' || dot_number from public.leads where id = ${LEAD}`));
  await admin.go(`/leads/${LEAD}`, 6000);
  check("…and shown", (await until(() => admin.ev(`[...document.querySelectorAll('[role=tabpanel]')].find((p) => p.offsetParent !== null && p.closest('[data-tabs], div'))?.innerText ?? null`)))?.includes("42"));

  section("Systems edited");
  await admin.click('[role=tab]', "Systems");
  await sleep(300);
  await admin.click("[data-edit-coverage]");
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] [data-coverage-line]')`));
  check("Contract renewal, and no Workers comp line", await admin.ev(`/Contract renewal/.test(document.querySelector('[role=dialog]').innerText) && !document.querySelector('[role=dialog] [data-coverage-line="wc"]')`));
  await admin.click("[role=dialog] button[type=submit]");
  await sleep(1500);
  check("…saved, what the line turned off holds kept", sql(`select wc_xdate || '|' || wc_carrier || '|' || ultimate_xdate from public.insurance_details where lead_id = ${LEAD}`) === "2027-02-01|Travelers|2027-04-01",
    sql(`select wc_xdate || '|' || wc_carrier || '|' || ultimate_xdate from public.insurance_details where lead_id = ${LEAD}`));

  section("For the client");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await client.go(`/leads/${LEAD}`, 6000);
  const seen = await until(() => client.ev(`[...document.querySelectorAll('[role=tabpanel]')].find((p) => p.offsetParent !== null && p.closest('[data-tabs], div'))?.innerText ?? null`), { timeout: 15000 });
  check("the client sees the same layout: its own fields, not XMOD", Boolean(seen?.includes("Desktops") && seen.includes("42") && !seen.includes("XMOD")), seen?.slice(0, 300));

  section("The lead sheet (what the client is emailed)");
  const sheet = await admin.ev(`fetch('/api/leads/${LEAD}/sheet').then((r) => r.text())`);
  check("laid out as the campaign type: Systems, Contract renewal, its own answers, no XMOD or DOT#",
    ["Systems", "Contract renewal", "Desktops", "42", "Cloud / hosting", "AWS"].every((t) => sheet.includes(t)) && !/XMOD|DOT#|Workers comp/.test(sheet), sheet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600));

  const asServer = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=company:companies(campaign_type:campaign_types(name))&id=eq.${P}`,
    { headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` } }).then((r) => r.json());
  check("…and the server reads the type too (the sheet emailed, Project Info saved by link)", asServer?.[0]?.company?.campaign_type?.name === NAME, JSON.stringify(asServer));

  section("Project Info");
  sql(`update public.campaign_types set fields = jsonb_set(jsonb_set(fields, '{builtin,info_sec_carriers}', '{"hidden": true}'), '{builtin,info_min_employees}', '{"label": "Minimum desktops"}')
    || '{"info_custom": [{"id": "i1", "label": "Help desk tool", "type": "select", "options": ["ConnectWise", "Autotask"]}]}'::jsonb where id = ${typeId}`);
  sql(`insert into public.project_profiles (project_id, top_carriers, min_employees) values (${P}, '{Travelers}', '10')`);
  await admin.go(`/leads/${LEAD}?tab=info`, 6000);
  const info = await until(() => admin.ev(`(() => { const v = document.querySelector('[data-project-info]'); return v ? { carriers: !!v.querySelector('[data-info-section="carriers"]'), text: v.innerText } : null; })()`));
  check("no Carriers, Minimum desktops, and its own question", info && !info.carriers && info.text.includes("Minimum desktops") && info.text.includes("Help desk tool"), JSON.stringify(info)?.slice(0, 400));
  await admin.click("[data-edit-project-info]");
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] [data-info-custom="i1"]')`));
  check("its form: no Carriers, its own question", await admin.ev(`!document.querySelector('[role=dialog] [data-info-group="carriers"]')`));
  await admin.fill('[role=dialog] [data-info-custom="i1"]', "Autotask");
  await admin.click("[role=dialog] button[type=submit]");
  const kept = await until(() => { const r = sql(`select custom::text || '|' || array_to_string(top_carriers, ',') from public.project_profiles where project_id = ${P}`); return r.startsWith('{"i1": "Autotask"}') ? r : null; }, { timeout: 15000 });
  check("saved its answer, the carriers it hides kept", kept === '{"i1": "Autotask"}|Travelers', sql(`select custom::text || '|' || array_to_string(top_carriers, ',') from public.project_profiles where project_id = ${P}`));

  section("Insurance unchanged");
  sql(`update public.companies set campaign_type_id = null where id = ${co}`);
  await admin.go(`/leads/${LEAD}`, 6000);
  const back = await until(() => admin.ev(`[...document.querySelectorAll('[role=tab]')].map((t) => t.textContent.trim()).join('|')`));
  check("back on Insurance: Coverage, XMOD", back.includes("Coverage") && (await admin.ev(`[...document.querySelectorAll('[role=tabpanel]')].find((p) => p.offsetParent !== null && p.closest('[data-tabs], div'))?.innerText ?? ''`)).includes("XMOD"), back);
} finally {
  browser.close();
  sql(`update public.users set company_id = ${clientCompany} where id = ${CLIENT}`);
  sql(`delete from public.leads where id = ${LEAD}`);
  sql(`delete from public.project_profiles where project_id = ${P}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${co}`);
  if (typeId) sql(`delete from public.campaign_types where id = ${typeId}`);
}

finish("campaign types");
