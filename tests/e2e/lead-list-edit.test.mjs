/**
 * Editing a lead from a row of the leads list (Oct 2026). The list carries
 * only what it shows, so the whole record is read when Edit is chosen: the
 * page itself has none of the rest (a field only the lead sheet shows is not
 * in it), and the form opens filled in, internal notes too, so saving it
 * keeps them. (Before, the list sent every lead's whole record, but not its
 * internal notes: saving from a row emptied them.)
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `LE-TEST ${Date.now()}`;
const NAME = `${TAG} Hayward Lumber`;
const DESCRIPTION = `${TAG} family-run since 1962, three yards`;
const NOTES = `${TAG} the owner's son decides; call after 3pm`;
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Agency`)}) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Lumber`)}, ${company}, ${typeId("DBDV")}, 1) returning id`));
const LEAD = Number(sql(`insert into public.leads (company_name, contact_name, phone, city, state, description, project_id, lead_date)
  values (${lit(NAME)}, 'Pat Olson', '715-555-0142', 'Hayward', 'WI', ${lit(DESCRIPTION)}, ${P}, now()) returning id`));
sql(`insert into public.lead_notes (lead_id, notes) values (${LEAD}, ${lit(NOTES)})`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 950 });

  section("The list carries only what it shows");
  await admin.go(`/leads?project=${P}`, 4000);
  check("the lead is listed", (await admin.text()).includes(NAME));
  check("…without the rest of its record in the page", !(await admin.ev("document.documentElement.outerHTML")).includes(DESCRIPTION));

  section("Edit from its row reads the whole record");
  await admin.pointer(`button[aria-label="Actions for ${NAME}"]`);
  await sleep(300);
  check("the row's menu has Edit", await admin.menuItem("Edit"));
  const form = await until(() => admin.ev(`!!document.querySelector('[data-dialog-content] input[name="company_name"]')`), { timeout: 10000 });
  check("the form opens with the lead", Boolean(form) && (await admin.ev(`document.querySelector('[data-dialog-content] input[name="company_name"]').value`)) === NAME);
  check("…its description", (await admin.ev(`document.querySelector('[data-dialog-content] [name="description"]')?.value`)) === DESCRIPTION);
  check("…and its internal notes", (await admin.ev(`document.querySelector('[data-dialog-content] textarea[name="internal_notes"]')?.value ?? ''`)).includes(NOTES),
    await admin.ev(`document.querySelector('[data-dialog-content] textarea[name="internal_notes"]')?.value`));

  section("Saving keeps the internal notes");
  await admin.fill('[data-dialog-content] input[name="contact_name"]', "Pat Olsen");
  await admin.click("[data-dialog-content] button[type=submit]");
  const saved = await until(() => sql(`select contact_name from public.leads where id = ${LEAD}`) === "Pat Olsen", { timeout: 10000 });
  check("the change is saved", Boolean(saved));
  check("…and the internal notes are still there", sql(`select notes from public.lead_notes where lead_id = ${LEAD}`).includes(NOTES),
    sql(`select coalesce(notes, '(none)') from public.lead_notes where lead_id = ${LEAD}`));

  section("Edit again reads it afresh");
  await sleep(800);
  await admin.pointer(`button[aria-label="Actions for ${NAME}"]`);
  await sleep(300);
  await admin.menuItem("Edit");
  await until(() => admin.ev(`!!document.querySelector('[data-dialog-content] input[name="contact_name"]')`), { timeout: 10000 });
  check("the form has what was just saved", (await admin.ev(`document.querySelector('[data-dialog-content] input[name="contact_name"]').value`)) === "Pat Olsen");
} finally {
  browser.close();
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${LEAD}`);
  sql(`delete from public.lead_notes where lead_id = ${LEAD}`);
  sql(`delete from public.leads where id = ${LEAD}`);
  sql(`delete from public.activity_log where entity = 'project' and entity_id = ${P}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("lead list edit");
