/**
 * Every field on a lead page, out and back in (Sean, Nov 2026: "in case we ever had to export a database and
 * reload, how would we keep the data from those fields … make the import/export template include every field on
 * the leads pages"): a lead with all of its business details, contacts and coverage exported from one project and
 * imported into another comes back the same.
 *
 *   node tests/run.mjs tests/e2e/export-roundtrip.test.mjs
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, finish, section } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `RT-TEST ${Date.now()}`;
const type = (c) => `(select id from public.project_types where code = '${c}')`;
const co = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const project = (name) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name}`)}, ${co}, ${type("DBDV")}, 1) returning id`));
const FROM = project("From");
const TO = project("To");
const LEAD = Number(sql(`insert into public.leads (company_name, project_id, phone, contact_name, contact_phone, contact2_name, contact2_title, contact2_phone,
    contact2_mobile, contact2_email, description, employees, employees_full_time, employees_part_time, subcontractors_pct, autos, drivers, xmod,
    sales_volume, annual_payroll, auto_types, travel_radius, dot_number, cargo, location, location_ownership, building_age, building_stories,
    building_acres, ein, years_in_business, estimated_annual_premium, claims_3yrs, professionals, covered_employees)
  values (${lit(`${TAG} Hunsaker Trucking`)}, ${FROM}, '6025551200', 'Dale Hunsaker', '6025551201', 'Amy Hunsaker', 'Office Manager', '6025551202',
    '6025551203', 'amy@hunsaker.example', 'Long-haul trucking', '40', 30, 10, 15, '22', 18, 0.92,
    '$4.2M', '$1.1M', '{big_rigs,delivery_trucks}', '500+', '1234567', 'General Freight', '2', 'own', 25, 2,
    3.5, '86-1234567', '31', '$85,000', true, '3', '38') returning id`));
// Carriers off the Insurance Companies list, as an import keeps only those.
const [CARRIER_A, CARRIER_B] = sql(`select name from public.agencies order by id limit 2`).split("\n");
sql(`insert into public.insurance_details (lead_id, ultimate_xdate, wc_xdate, wc_carrier, personal_lines_xdate, personal_lines_carrier, agency_name)
  values (${LEAD}, '2027-03-01', '2027-03-01', ${lit(CARRIER_A)}, '2027-06-15', ${lit(CARRIER_B)}, 'Desert Agency')`);
const FIELDS = `contact_phone, contact2_name, contact2_title, contact2_phone, contact2_mobile, contact2_email, description, employees,
  employees_full_time, employees_part_time, subcontractors_pct, autos, drivers, xmod, sales_volume, annual_payroll, auto_types, travel_radius,
  dot_number, cargo, location, location_ownership, building_age, building_stories, building_acres, ein, years_in_business,
  estimated_annual_premium, claims_3yrs, professionals, covered_employees`;
const snapshot = (pid) => sql(`select row_to_json(t)::text from (select ${FIELDS.split(",").map((f) => `l.${f.trim()}`).join(", ")},
  i.ultimate_xdate, i.wc_xdate, i.wc_carrier, i.personal_lines_xdate, i.personal_lines_carrier, i.agency_name
  from public.leads l left join public.insurance_details i on i.lead_id = l.id where l.project_id = ${pid} and l.company_name = ${lit(`${TAG} Hunsaker Trucking`)}) t`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1400, height: 950 });
  await admin.go("/imports", 4000);

  section("Exported");
  const csv = await admin.ev(`fetch('/api/projects/${FROM}/export').then((r) => r.text())`);
  const head = String(csv).split(/\r?\n/)[0];
  check("the export has every lead page field's column", ["Contact Direct Phone", "Contact 2 Email", "Description", "Full-Time Employees", "Subcontractors %",
    "Annual Payroll", "Vehicle Types", "Travel Radius", "DOT Number", "Cargo", "Building Own/Lease", "Building Acres", "Claims Last 3 Yrs",
    "Professionals", "Covered Employees", "Personal Lines XDate", "Personal Lines Carrier"].every((h) => head.includes(h)), head);
  const row = String(csv).split(/\r?\n/).find((l) => l.includes("Hunsaker Trucking")) ?? "";
  check("…as the lead page says them", ["Big rigs, Delivery trucks", "Own", "Yes", "500+", "General Freight", "1234567"].every((v) => row.includes(v)), row);

  section("Imported into another project");
  const file = path.join(mkdtempSync(path.join(tmpdir(), "rt-")), "export.csv");
  writeFileSync(file, csv);
  await admin.fill('select[name="project_id"]', String(TO));
  const { root } = await admin.send("DOM.getDocument");
  const { nodeId } = await admin.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[name="file"]' });
  await admin.send("DOM.setFileInputFiles", { nodeId, files: [file] });
  await admin.click("button[type=submit]", "Import leads");
  const said = await admin.waitToast(/Imported 1 of 1/, 20000);
  check("it imports", /Imported 1 of 1/.test(said ?? ""), said);
  const before = JSON.parse(snapshot(FROM) || "null");
  const after = JSON.parse(snapshot(TO) || "null");
  const differ = before && after ? Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])) : ["(missing)"];
  check("…every field comes back the same", differ.length === 0, differ.map((k) => `${k}: ${JSON.stringify(before?.[k])} → ${JSON.stringify(after?.[k])}`).join("; "));
} finally {
  browser.close();
  sql(`delete from public.leads where project_id in (${FROM}, ${TO})`);
  sql(`delete from public.import_batches where project_id in (${FROM}, ${TO})`);
  sql(`delete from public.projects where id in (${FROM}, ${TO})`);
  sql(`delete from public.companies where id = ${co}`);
}

finish("export roundtrip");
