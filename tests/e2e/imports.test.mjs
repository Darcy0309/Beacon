/**
 * Importing a list from the old system (Sean, Oct 2026): its old call
 * results become the new ones without editing the file; one the system does
 * not know is said so, and that name starts as a new one; "n/a", "no site"
 * and the like in a field are left blank, and only real web and email
 * addresses are kept.
 *
 * A whole book of business is megabytes, not kilobytes (Capital-Maricopa,
 * Oct 2026: 2.6 MB, refused by the 1 MB action limit), and an upload the
 * server never answers is said, not lost to the error screen.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/imports.test.mjs
 */
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `IMP-E2E ${Date.now()}`;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} DBDev`)}, ${company},
  (select id from public.project_types where code = 'DBDV'), 1) returning id`));
const file = path.join(mkdtempSync(path.join(tmpdir(), "import-")), "list.csv");
const NEW_SIC = `9${String(Date.now()).slice(-3)}-77`;
writeFileSync(file, [
  "Company,Phone,Website,Email,Call Result DBDV,SICCode,SICDesc",
  `"${TAG} Alpha",602-555-0101,n/a,no email,Left Message,1711,`,
  `"${TAG} Beta",602-555-0102,www.betaplumbing.com,bob@beta.com,DNC,,"Plumbing, Heating & Air-Conditioning"`,
  `"${TAG} Gamma",602-555-0103,No Site,N/A,Callback,${NEW_SIC},${TAG} widgets`,
  `"${TAG} Delta",602-555-0104,see notes,dave at delta,Old Weird Result,,Nothing like any SIC`,
].join("\n"));
const sic = (name) => sql(`select coalesce(sic_code, '') || '|' || coalesce(description, '') from public.leads where company_name = ${lit(`${TAG} ${name}`)}`);
const row = (name) => sql(`select coalesce(l.website, '') || '|' || coalesce(l.email, '') || '|' || r.name from public.leads l join public.call_results r on r.id = l.result_id
  where l.company_name = ${lit(`${TAG} ${name}`)}`);
const leadCount = () => Number(sql(`select count(*) from public.leads where project_id = ${project}`));

// Over the 1 MB a server action takes by default: long notes, as an old book has.
const BIG_ROWS = 600;
const bigFile = path.join(path.dirname(file), "book.csv");
const note = "Spoke with the owner, call back after the renewal; wants a quote on the package. ".repeat(30);
writeFileSync(bigFile, ["Company,Phone,Call Result DBDV,Internal Notes",
  // Another area code from the small list's: its DNC name (602-555-0102) is on the client's removal list, and would take one off.
  ...Array.from({ length: BIG_ROWS }, (_, i) => `"${TAG} Book ${i}",603-555-${String(i).padStart(4, "0")},Viable-No Contact,"${note}"`)].join("\n"));

// A SalesGenie export as it comes (Oct 2026): one business twice at the same phone, one with two offices, one the
// client said not to call before, and one left off an earlier list as a duplicate.
const sgFile = path.join(path.dirname(file), "salesgenie.csv");
const SG_HEAD = "Date List Produced,Company Name,Phone Number Combined,Executive First Name,Executive Last Name,Executive Title,Mailing Address,Mailing City,Location Address,Location City,Location State,Location ZIP Code,Fax Number Combined,County Description,Company Website,Location Employee Size Actual,Location Sales Volume Actual,Location Sales Volume Range,Primary SIC Code,Primary SIC Code Description,EIN 1,First Name 1,Last Name 1,Executive Title 1,Executive Gender 1,First Name 2,Last Name 2,Executive Title 2,Latitude";
writeFileSync(sgFile, [SG_HEAD,
  `10/28/2026,${TAG} Dix Concrete Inc,(920) 766-4344,Allan,Dix,Owner,PO Box 1,Kaukauna,401 Gertrude St,Kaukauna,WI,54130,(920) 766-4866,Outagamie,http://Aldixconcrete.Com,13,"$464,000 ","Less Than $500,000",1771-05,Concrete Contractors,,Dylan,Marx,Manager,Male,Travis,Haen,Other,44.28`,
  `10/28/2026,${TAG} Dix Concrete Inc,(920) 766-4344,Michael,Dix,Manager,,,W4437 Schmidt Rd,Kaukauna,WI,54130,Not Available,Calumet,http://Aldixconcrete.Com,6,"$673,000 ","$500,000-1 Million",1771-05,Concrete Contractors,,,,,,,,,44.22`,
  `10/28/2026,${TAG} Acculevel,(920) 710-6078,,,,,,444 Reid St # 301,De Pere,WI,54115,Not Available,Brown,http://Acculevel.Com,7,"$931,000 ","$500,000-1 Million",1741-01,Masonry Contractors,,,,,,,,,44.44`,
  `10/28/2026,${TAG} Acculevel,(920) 310-3150,,,,,,2149 Velp Ave # 102,Green Bay,WI,54303,Not Available,Brown,http://Acculevel.Com,7,"$931,000 ","$500,000-1 Million",1741-01,Masonry Contractors,,,,,,,,,44.55`,
  `10/28/2026,${TAG} Called Before Co,(920) 555-7777,Pat,Lee,Owner,,,1 Elm St,Appleton,WI,54911,Not Available,Outagamie,,5,,,7538-01,Automobile Repairing & Service,,,,,,,,,44.26`,
  `10/28/2026,${TAG} Old Branch,(920) 555-8888,,,,,,9 Oak St,Neenah,WI,54956,Not Available,Winnebago,,5,,,7538-01,Automobile Repairing & Service,,,,,,,,,44.18`,
  `10/28/2026,${TAG} Accurate Svc,(920) 731-5442,Mark,Broehm,Owner,,,3020 W Franklin St,Appleton,WI,54914,Not Available,Outagamie,,38,,$5-10 Million,5013-14,Automobile Repair/Svc-Equip/Supl (Whls),391178301,Dennis,Broehm,Manager,Male,,,,44.26`,
].join("\n"));
sql(`insert into public.client_removals (company_id, reason, source, company_name, phone) values (${company}, 'dont_call', 'lead', 'Someone', '920.555.7777')`);
sql(`insert into public.client_removals (company_id, reason, source, company_name, address, zip) values (${company}, 'deletion', 'import', ${lit(`${TAG} Old Branch`)}, '9 Oak St', '54956')`);
const sg = (name) => sql(`select coalesce(contact_name, '') || '|' || coalesce(contact2_name, '') || '|' || coalesce(address, '') || '|' || coalesce(city, '') || '|' || coalesce(phone, '')
  || '|' || coalesce(fax, '') || '|' || coalesce(sales_volume, '') || '|' || coalesce(ein, '') from public.leads where company_name = ${lit(`${TAG} ${name}`)} order by id`);

/** Open the import form on the test project with `csv` chosen. */
async function chooseFile(page, csv) {
  await page.go("/imports", 4000);
  await page.fill('select[name="project_id"]', String(project));
  const { root } = await page.send("DOM.getDocument");
  const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[name="file"]' });
  await page.send("DOM.setFileInputFiles", { nodeId, files: [csv] });
}

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1280, height: 900 });
  await chooseFile(admin, file);
  await admin.click("button[type=submit]", "Import leads");
  const said = await admin.waitToast(/Imported 4 of 4/, 15000);

  section("Old call results");
  check("the list imports", /Imported 4 of 4/.test(said ?? ""), said);
  check("old results read as the new ones, without editing the file",
    row("Alpha").endsWith("|Viable-Left Message") && row("Beta").endsWith("|DoNotCall") && row("Gamma").endsWith("|Viable-CallBack"),
    [row("Alpha"), row("Beta"), row("Gamma")].join(" / "));
  check("one the system does not know: the name starts as a new one", row("Delta").endsWith("|Viable-CallBack"), row("Delta"));
  check("…and the import says which", Boolean(await until(async () => /doesn't recognise[\s\S]*Old Weird Result/i.test((await admin.toasts()) ?? ""), { timeout: 8000 })), await admin.toasts());

  section("Empty-looking fields");
  check("“n/a”, “no site”, “no email” are left blank", row("Alpha").startsWith("||") && row("Gamma").startsWith("||"), `${row("Alpha")} / ${row("Gamma")}`);
  check("real web and email addresses are kept", row("Beta").startsWith("www.betaplumbing.com|bob@beta.com|"), row("Beta"));
  check("…and what is not one is not", row("Delta").startsWith("||"), row("Delta"));

  section("SIC code and description");
  check("a code alone is kept", sic("Alpha") === "1711|", sic("Alpha"));
  check("a description alone finds its code in the SIC list", sic("Beta") === "1711|", sic("Beta"));
  check("a code and description the list does not have are added to it",
    sic("Gamma").startsWith(`${NEW_SIC}|`) && sql(`select description from public.sic_codes where code = ${lit(NEW_SIC)}`) === `${TAG} widgets`, sic("Gamma"));
  check("a description with no code to match is kept on the lead", sic("Delta") === "|Nothing like any SIC", sic("Delta"));

  section("A list over 1 MB");
  const size = statSync(bigFile).size;
  check("the test file is over 1 MB", size > 1024 * 1024, `${size} bytes`);
  await chooseFile(admin, bigFile);
  await admin.click("button[type=submit]", "Import leads");
  const bigSaid = await admin.waitToast(new RegExp(`Imported ${BIG_ROWS} of ${BIG_ROWS}`), 90000);
  check("it imports", new RegExp(`Imported ${BIG_ROWS} of ${BIG_ROWS}`).test(bigSaid ?? ""), bigSaid);
  check("…every row of it", leadCount() === 4 + BIG_ROWS, leadCount());
  // New names are called in id order: the file's order has to survive the chunks.
  const order = sql(`select string_agg(split_part(company_name, ' Book ', 2), ',' order by id) from public.leads
    where project_id = ${project} and company_name like ${lit(`${TAG} Book %`)}`);
  check("…in the file's order, across chunks", order === Array.from({ length: BIG_ROWS }, (_, i) => i).join(","), order.slice(0, 80));
  const bookNotes = Number(sql(`select count(*) from public.lead_notes n join public.leads l on l.id = n.lead_id
    where l.project_id = ${project} and l.company_name like ${lit(`${TAG} Book %`)}`));
  check("…with every row's notes, all in before the import says it is done", bookNotes === BIG_ROWS, bookNotes);

  section("An upload the server never answers");
  const leadsBefore = leadCount();
  await chooseFile(admin, file);
  // A gateway timeout or a host's size refusal: not a result, an HTML error page.
  await admin.ev(`(() => { const real = window.fetch;
    window.fetch = (input, init) => init?.method === 'POST' && new Headers(init.headers).has('next-action')
      ? Promise.resolve(new Response('<html>Gateway Timeout</html>', { status: 504, headers: { 'content-type': 'text/html' } }))
      : real(input, init); return true; })()`);
  await admin.click("button[type=submit]", "Import leads");
  const failed = await admin.waitToast(/did not finish/i, 10000);
  check("the import says it did not finish", /did not finish/i.test(failed ?? ""), failed);
  // The error screen reloads the page by itself, and React empties a form
  // after its action: either way the chosen file would be gone.
  const form = await admin.ev(`(() => { const f = document.querySelector('input[name="file"]')?.closest('form');
    return { button: [...(f?.querySelectorAll('button') ?? [])].some((b) => b.textContent.trim() === 'Import leads'),
      files: f?.querySelector('input[name="file"]').files.length ?? 0, project: f?.querySelector('select[name="project_id"]').value }; })()`);
  check("…and the form stays, with the file and project still chosen to try again",
    form.button && form.files === 1 && form.project === String(project), JSON.stringify(form));
  check("nothing was added", leadCount() === leadsBefore, leadCount());

  section("A SalesGenie export, with duplicates and names taken off before");
  await chooseFile(admin, sgFile);
  const summary = await until(async () => admin.ev(`document.querySelector('[data-import-summary]')?.textContent ?? ''`), { timeout: 15000 });
  check("the list is checked before it goes", /3 of 7 rows will be imported/.test(summary ?? ""), summary);
  const counts = await admin.ev(`({ dup: document.querySelector('[data-duplicate-count]')?.textContent, removed: document.querySelector('[data-removed-count]')?.textContent })`);
  check("…two duplicates found (one business at one phone; one with two offices)", counts.dup === "2", JSON.stringify(counts));
  check("…and the name the client said not to call, and the branch left off before, left out", counts.removed === "2", JSON.stringify(counts));
  await admin.click("[data-review-duplicates]");
  const groups = await until(async () => Number(await admin.ev(`document.querySelectorAll('[data-duplicate-group]').length`)) || 0);
  check("Review duplicates shows each group", groups === 2, groups);
  // The two offices are two places the client wants called: both kept.
  await admin.ev(`[...document.querySelectorAll('[data-duplicate-group]')].find((g) => g.textContent.includes('Acculevel')).querySelector('[data-keep-all]').click()`);
  const after = await until(async () => (await admin.ev(`document.querySelector('[data-import-summary]')?.textContent ?? ''`)).includes("4 of 7") && admin.ev(`document.querySelector('[data-import-summary]').textContent`));
  check("…and keeping both offices puts one back", /4 of 7/.test(after || ""), after);
  await admin.click("button[type=submit]", "Import leads");
  const sgSaid = await admin.waitToast(/Imported 4 of 7/, 20000);
  check("it imports, saying what it left off", /Imported 4 of 7.*1 duplicate left off.*2 taken off before/.test(sgSaid ?? ""), sgSaid);
  check("one business at one phone: the record naming more people is kept, its columns read",
    sg("Dix Concrete Inc") === "Allan Dix|Dylan Marx|401 Gertrude St|Kaukauna|(920) 766-4344|(920) 766-4866|Less Than $500,000|", sg("Dix Concrete Inc"));
  check("…its third person in the internal notes", sql(`select n.notes from public.lead_notes n join public.leads l on l.id = n.lead_id where l.company_name = ${lit(`${TAG} Dix Concrete Inc`)}`) === "Other contact: Travis Haen, Other");
  check("both offices kept", sg("Acculevel").split("\n").length === 2, sg("Acculevel"));
  check("the FEIN kept", sg("Accurate Svc").endsWith("|39-1178301"), sg("Accurate Svc"));
  check("names taken off before are not imported", sg("Called Before Co") === "" && sg("Old Branch") === "", `${sg("Called Before Co")} / ${sg("Old Branch")}`);
  check("the duplicate left off is a Deletion on the client's list, for later lists",
    sql(`select reason || '|' || source || '|' || address from public.client_removals where company_id = ${company} and company_name = ${lit(`${TAG} Dix Concrete Inc`)}`) === "deletion|import|W4437 Schmidt Rd");
  check("the import's history says so", sql(`select row_count || '|' || imported_count || '|' || duplicate_count || '|' || removed_count from public.import_batches
    where project_id = ${project} and file_name = 'salesgenie.csv'`) === "7|4|1|2");

  section("The SIC list in Settings");
  await admin.go("/settings", 4000);
  const before = Number((await admin.ev(`document.querySelector('[data-sic-count]')?.textContent ?? '0'`)).replace(/\D/g, ""));
  const listFile = path.join(path.dirname(file), "sic.csv");
  writeFileSync(listFile, ["SICCode,SICDesc", `${NEW_SIC},${TAG} widgets and gadgets`, `8${String(Date.now()).slice(-3)}-11,${TAG} new trade`].join("\n"));
  const doc = await admin.send("DOM.getDocument");
  const input = await admin.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "input[data-sic-import]" });
  await admin.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [listFile] });
  const loaded = await admin.waitToast(/SIC code/, 10000);
  check("loading a list adds new codes and updates descriptions", /1 SIC code added, 1 descriptions? updated/.test(loaded ?? ""), loaded);
  check("…the count follows", Boolean(await until(async () => Number((await admin.ev(`document.querySelector('[data-sic-count]')?.textContent ?? '0'`)).replace(/\D/g, "")) === before + 1)));
  check("…and the list can be downloaded", (await admin.ev(`fetch('/api/sic-codes').then((r) => r.text())`)).startsWith("SIC Code,SIC Description"));
} finally {
  sql(`delete from public.sic_codes where description like ${lit(`${TAG}%`)}`);
  browser.close();
  sql(`delete from public.lead_notes where lead_id in (select id from public.leads where project_id = ${project})`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where project_id = ${project})`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.import_batches where project_id = ${project}`);
  sql(`delete from public.activity_log where created_at > now() - interval '10 minutes' and action like 'import%'`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("imports");
