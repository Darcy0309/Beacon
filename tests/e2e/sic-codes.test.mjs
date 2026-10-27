/**
 * The SIC master list (Sean, Oct 2026): a code a spreadsheet took the leading
 * zero off ("111") comes in as 0111, whatever writes it (the list, a lead);
 * and the list can be replaced by a file, codes not in it taken off except
 * those a client is filed under.
 *
 * The list is put back as it was afterwards.
 *
 *   npm run test:e2e
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `SIC-TEST ${Date.now()}`;
const dir = mkdtempSync(path.join(tmpdir(), "sic-"));
const file = (name, text) => { const p = path.join(dir, name); writeFileSync(p, text); return p; };
sql("drop table if exists public._sic_test_backup; create table public._sic_test_backup as select * from public.sic_codes");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));

const browser = await launchBrowser();
try {
  section("A code that lost its zero gets it back");
  sql("insert into public.sic_codes (code, description) values ('9101', 'Kept by a client') on conflict (code) do nothing");
  sql(`update public.companies set sic_code = '9101' where id = ${company}`);
  sql("insert into public.sic_codes (code, description) values ('115', 'Corn, written by SQL') on conflict (code) do nothing");
  check("written by SQL: 115 is kept as 0115", sql("select count(*) from public.sic_codes where code = '0115'") === "1" && sql("select count(*) from public.sic_codes where code = '115'") === "0");

  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  const upload = async (p) => {
    const doc = await admin.send("DOM.getDocument");
    const input = await admin.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "[data-sic-import]" });
    await admin.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [p] });
  };
  const toastSays = (re) => until(() => admin.ev(`[...document.querySelectorAll('[data-sonner-toast]')].some((t) => ${re}.test(t.textContent))`), { timeout: 20000 });
  await admin.go("/settings", 8000);
  await until(() => admin.ev("!!document.querySelector('[data-sic-import]')"), { timeout: 30000 });
  await upload(file("list.csv", `SIC Code,SIC Description\n111,${TAG} Wheat\n11101,${TAG} Durum\n`));
  check("loaded from a sheet: 111 is 0111, 11101 is 011101", Boolean(await until(() => sql(`select string_agg(code, ',' order by code) from public.sic_codes where description like ${lit(`${TAG}%`)}`) === "0111,011101" || null, { timeout: 20000 })));
  check("…and nothing kept without its zero", sql("select count(*) from public.sic_codes where code in ('111', '11101')") === "0");

  section("Replace the whole list");
  await admin.ev("document.querySelector('[data-sic-replace]').click()");
  await upload(file("replace.csv", `SIC Code,SIC Description\n111,${TAG} Wheat\n1521,${TAG} Homes\n`));
  check("the list becomes the file, and says so", Boolean(await toastSays("/removed/")));
  check("…codes not in it taken off, but the one a client is filed under stays",
    sql("select string_agg(code, ',' order by code) from public.sic_codes") === "0111,1521,9101", sql("select string_agg(code, ',' order by code) from public.sic_codes"));
  check("…and the box unticked after", (await admin.ev("document.querySelector('[data-sic-replace]').checked")) === false);
} finally {
  browser.close();
  sql(`update public.companies set sic_code = null where id = ${company}`);
  sql(`delete from public.companies where id = ${company}`);
  sql("delete from public.sic_codes; insert into public.sic_codes select * from public._sic_test_backup; drop table public._sic_test_backup");
}

finish("sic codes");
