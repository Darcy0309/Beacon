/**
 * The Pipeline by Month (Sean, Nov 2026: the old system's pipeline sheet), on a
 * project's page under its X-Dates by Month and above its leads, and on the
 * X-Dates report: each month's leads, those off the list (resolved,
 * appointments and invalid ones among them), viable, appointments projected
 * at 20% or the rate an administrator sets on the project, the conversion,
 * and those set. Staff's; a client's people don't see it.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/pipeline-months.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PM-E2E ${Date.now()}`;
const company = Number(sql("select company_id from public.users where email = 'client@beacon.test'"));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1) returning id`));
let n = 0;
const lead = (result, xdate) => {
  n += 1;
  const id = Number(sql(`insert into public.leads (company_name, project_id, stage, result_id)
    values (${lit(`${TAG} ${n}`)}, ${P}, 'appt', public.call_result_from_text('APPT', ${lit(result)})) returning id`));
  sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${id}, ${lit(xdate)})`);
};
// January: three to work, one resolved, one appointment. March: one to work, one invalid appointment.
for (const r of ["Lead-No Contact", "Lead-Viable", "Lead-Left Message", "Lead-Never Shops", "Appointment"]) lead(r, "2027-01-15");
for (const r of ["Lead-No Contact", "Appointment-Invalid"]) lead(r, "2027-03-10");

// The table's rows, each [label, Total, Jan, …, Dec].
const table = (page) => page.ev(`[...document.querySelectorAll('[data-pipeline-card] [data-pipeline-row]')].map((r) => [...r.cells].map((c) => c.textContent.trim()))`);
const row = (rows, key) => rows.find((r) => r[0].toLowerCase().startsWith(key));

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1100 });

  section("On the project's page");
  await admin.go(`/projects/${P}`, 7000);
  const rows = await until(() => table(admin).then((r) => r.length === 6 && r));
  check("under X-Dates by Month and above the leads", await admin.ev(`(() => { const x = [...document.querySelectorAll('h2, h3, [class*=SectionHeader], span')].find((e) => e.textContent.trim() === 'X-Dates by Month');
    const p = document.querySelector('[data-pipeline-card]'), l = document.getElementById('leads');
    return Boolean(x && p && l) && (x.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) && (p.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING); })()`));
  check("each month's leads, the year's first", JSON.stringify(row(rows, "total by month").slice(1, 5)) === JSON.stringify(["7", "5", "0", "2"]), JSON.stringify(row(rows, "total by month")));
  check("off the list: resolved, an appointment and an invalid one among them", JSON.stringify(row(rows, "off the list").slice(1, 5)) === JSON.stringify(["3", "2", "0", "1"]), JSON.stringify(row(rows, "off the list")));
  check("viable", JSON.stringify(row(rows, "viable").slice(1, 5)) === JSON.stringify(["4", "3", "0", "1"]), JSON.stringify(row(rows, "viable")));
  check("projected at 20%: 1 of January's 5", row(rows, "projected")[0] === "Projected appts (20%)" && JSON.stringify(row(rows, "projected").slice(1, 5)) === JSON.stringify(["1", "1", "0", "0"]), JSON.stringify(row(rows, "projected")));
  check("each month's conversion: January 20%, March 0%, none for a month with no leads", JSON.stringify(row(rows, "conversion").slice(1, 5)) === JSON.stringify(["", "20%", "—", "0%"]), JSON.stringify(row(rows, "conversion")));
  check("the appointments set", JSON.stringify(row(rows, "actual").slice(1, 5)) === JSON.stringify(["1", "1", "0", "0"]), JSON.stringify(row(rows, "actual")));
  check("…and the overall conversion: 1 of 7 is 14%", /Overall conversion: 14%/.test(await admin.ev("document.querySelector('[data-pipeline-overall]').textContent")));

  section("The project's own rate");
  await admin.click("button", "Edit");
  await until(() => admin.ev("!!document.querySelector('[data-projected-conversion]')"));
  check("the project's form has it, empty for 20%", (await admin.ev("document.querySelector('[data-projected-conversion]').value")) === "");
  await admin.fill("[data-projected-conversion]", "50");
  await admin.click("[role=dialog] button[type=submit]");
  check("saved", Boolean(await until(() => sql(`select projected_conversion from public.projects where id = ${P}`) === "50.00")));
  await admin.go(`/projects/${P}`, 5000);
  const at50 = await until(() => table(admin).then((r) => r.length === 6 && row(r, "projected")[0].includes("50%") && r));
  check("the projection follows it: half of January's 5 is 3, of the year's 7 is 4", Boolean(at50) && JSON.stringify(row(at50, "projected").slice(1, 3)) === JSON.stringify(["4", "3"]), JSON.stringify(at50 && row(at50, "projected")));

  section("The X-Dates report");
  await admin.go(`/reports/x-dates?project=${P}`, 6000);
  const report = await until(() => table(admin).then((r) => r.length === 6 && r));
  check("…shows it for the project, at its rate", Boolean(report) && row(report, "projected")[0] === "Projected appts (50%)" && row(report, "total by month")[1] === "7", JSON.stringify(report && row(report, "projected")));

  section("A client's people");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1500, height: 1100 });
  await client.go(`/projects/${P}`, 6000);
  await until(() => client.ev("!!document.getElementById('leads')"));
  await sleep(500);
  check("don't see it", !(await client.ev("!!document.querySelector('[data-pipeline-card]')")));
} finally {
  browser.close();
  sql(`delete from public.leads where project_id = ${P}`);
  sql(`delete from public.projects where id = ${P}`);
}

finish("pipeline by month");
