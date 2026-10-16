/**
 * Every list's names open what they name (Sean, Oct 2026), the ⋯ menu kept
 * beside them: a lead in the Leads list opens its lead; a user and an
 * insurance company (no page of their own) open their form; an account
 * manager opens their dashboard; a policy file in Documents opens the file;
 * an import's project, and an activity entry's lead, open their pages.
 *
 * Removes everything it made.
 *
 *   node tests/run.mjs tests/e2e/name-links.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `NL ${Date.now()}`;
const ADMIN = Number(sql("select id from public.users where email='admin@beacon.test'"));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code='APPT'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, project_id) values (${lit(`${TAG} Parkview Car Wash`)}, ${project}) returning id`));
const doc = Number(sql(`insert into public.documents (name, lead_id, project_id, company_id, storage_path, file_type, uploaded_by)
  values (${lit(`${TAG} policy.pdf`)}, ${lead}, ${project}, ${company}, ${lit(`lead/${lead}/x-policy.pdf`)}, 'PDF', ${ADMIN}) returning id`));
sql(`insert into public.activity_log (user_id, action, entity, entity_id, detail) values (${ADMIN}, 'lead.update', 'lead', ${lead}, ${lit(`${TAG} Parkview Car Wash`)})`);
const batch = Number(sql(`insert into public.import_batches (file_name, project_id, status, row_count, imported_count, error_count, imported_by)
  values (${lit(`${TAG}.csv`)}, ${project}, 'completed', 1, 1, 0, ${ADMIN}) returning id`) || 0);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  const href = (sel) => admin.ev(`document.querySelector(${JSON.stringify(sel)})?.getAttribute('href') ?? null`);

  section("Leads");
  await admin.go(`/leads?q=${encodeURIComponent(TAG)}`, 5000);
  // The lead's page, carrying the list's address for its back link.
  const link = `[data-lead-link][href^="/leads/${lead}?from="]`;
  check("the company's name is a link to the lead", Boolean(await until(() => href(link))));
  check("…the ⋯ menu still beside it", await admin.ev(`!!document.querySelector(${JSON.stringify(link)}).closest('tr').querySelector('[aria-label^="Actions for"]')`));
  await admin.click(link);
  check("…and it opens the lead", Boolean(await until(async () => (await admin.path()) === `/leads/${lead}`)), await admin.path());

  section("Users and insurance companies: their form");
  await admin.go("/users", 5000);
  await admin.click("[data-user-link]");
  check("a user's name opens their form", Boolean(await until(() => admin.ev(`!!document.querySelector('[role=dialog]')`))));
  await admin.go("/insurance-companies", 5000);
  await until(() => admin.ev(`!!document.querySelector('[data-carrier-link]')`));
  await admin.click("[data-carrier-link]");
  check("an insurance company's name opens its form", Boolean(await until(() => admin.ev(`!!document.querySelector('[role=dialog]')`))));

  section("Account managers, documents, imports, activity");
  await admin.go("/account-managers", 5000);
  check("an account manager's name opens their dashboard", /^\/\?view=\d+$/.test((await until(() => href("[data-manager-link]"))) ?? ""));
  await admin.go(`/documents?q=${encodeURIComponent(TAG)}`, 5000);
  check("a policy file's name opens the file", (await until(() => href("[data-document-link]"))) === `/api/files/${doc}`);
  await admin.click("[data-document-link]");
  check("…in Lighthouse's viewer, not a download", Boolean(await until(() => admin.ev(`document.querySelector('[data-file-viewer="${doc}"] iframe[data-file-frame]')?.getAttribute('src') === '/api/files/${doc}'`))));
  await admin.click(`[data-file-viewer="${doc}"] button`, "Close");
  await until(() => admin.ev(`!document.querySelector('[data-file-viewer]')`));
  await admin.pointer(`button[aria-label="Actions for ${TAG} policy.pdf"]`);
  await sleep(400);
  await admin.menuItem("View");
  check("…and from the row's menu, View", Boolean(await until(() => admin.ev(`!!document.querySelector('[data-file-viewer="${doc}"] iframe[data-file-frame]')`))));
  await admin.go(`/imports?q=${encodeURIComponent(TAG)}`, 5000);
  check("an import's project opens the project", !batch || (await until(() => href("[data-import-project]"))) === `/projects/${project}`);
  await admin.go(`/activity?q=${encodeURIComponent(TAG)}`, 5000);
  check("an activity entry opens the lead it was about", (await until(() => href("[data-activity-link]"))) === `/leads/${lead}`);
} finally {
  browser.close();
  sql(`delete from public.activity_log where detail like ${lit(`${TAG}%`)}`);
  sql(`delete from public.import_batches where file_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.documents where id = ${doc}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}
finish("name links");
