/**
 * List Builder (Sean, Oct 2026): staff build a request for a client from the
 * SIC tree (a sector opened with +, a group ticked whole, a code found by
 * name), the employee size for each group, the territory (a state, a radius
 * around a ZIP) and what to leave out; it is kept with the client, its Sales
 * Rep is told, and it exports its codes one to a line. A prospect fills one
 * in from a link without signing in; a link turned off is closed. A client
 * makes their own, and sees what they asked for before.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `LB-TEST ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const MIKE = userId("mike@beacon.test");
const ADMIN = userId("admin@beacon.test");
const CLIENT = userId("client@beacon.test");
const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Insurance`)}, ${MIKE}) returning id`));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id = ${CLIENT}`);
sql(`update public.users set company_id = ${company} where id = ${CLIENT}`);
const one = (q) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${q}) t`));

const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 25000) => until(() => page.ev(expr), { timeout });
const tick = (page, code) => page.ev(`(() => { const b = document.querySelector('[data-sic-tick="${code}"]'); if (!b) return false; b.click(); return true; })()`);
const setValue = (page, sel, value) => page.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("Sean's SIC sheet, loaded by an administrator");
  {
    const SHEET = "/home/momo/Downloads/SIC_ListBuildingSheet-COMPLETE_2026-10-27.csv";
    await admin.go("/list-builder", 8000);
    await when(admin, "!!document.querySelector('[data-sic-upload]')");
    const doc = await admin.send("DOM.getDocument");
    const input = await admin.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "[data-sic-upload]" });
    await admin.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [SHEET] });
    check("the tree becomes the sheet: its 10 sectors, 73 groups and 950 codes, each code's class",
      Boolean(await until(() => sql("select string_agg(kind || ':' || n, ',' order by kind) from (select kind, count(*) n from public.list_sic group by kind) k") === "group:73,industry:950,sector:10" || null, { timeout: 30000 }))
      && sql("select class from public.list_sic where code = '0781'") === "Artisan-Special Trade Contractors");
  }

  section("Staff build a request for a client");
  await admin.go("/list-builder", 8000);
  check("List Builder, with New request and the prospects' links", Boolean(await when(admin, "!!document.querySelector('[data-new-request]') && !!document.querySelector('[data-prospect-links]')")));
  await admin.go(`/list-builder/new?client=${company}`, 8000);
  await when(admin, "!!document.querySelector('[data-sic-tree]')");
  check("the client chosen to begin with", (await admin.ev("document.querySelector('[data-request-client]').value")) === String(company));
  check("the SIC tree: Sean's sheet's sectors, closed", (await admin.ev("[...document.querySelectorAll('[data-sic-tree] > div:last-child > [data-sic-node]')].map((n) => n.dataset.sicNode).join()")) === "01-09,10-14,15-17,20-39,40-49,50-51,52-59,64-65,70-89,91-95");
  await admin.ev("document.querySelector('[data-sic-open=\"15-17\"]').click()");
  check("+ opens a sector into its groups", Boolean(await when(admin, "!!document.querySelector('[data-sic-tick=\"15\"]') && !!document.querySelector('[data-sic-tick=\"17\"]')")));
  // A whole industry class: across groups (0781 Landscape Counseling is an artisan trade too).
  await admin.fill("[data-sic-class]", "Artisan-Special Trade Contractors");
  check("an industry class ticked whole, across the tree", (await until(() => admin.ev("document.querySelector('[data-sic-picked]')?.textContent ?? ''").then((t) => (/^2\d picked/.test(t) ? t : null)))) !== null);
  await admin.ev("[...document.querySelectorAll('[data-sic-tree] button')].find((b) => b.textContent.trim() === 'Clear')?.click()");
  await when(admin, "/^0 picked/.test(document.querySelector('[data-sic-picked]')?.textContent ?? '')");
  await tick(admin, "15");
  check("a group ticked whole: all its codes", (await admin.ev("document.querySelector('[data-sic-tick=\"15\"]').getAttribute('aria-checked')")) === "true"
    && (await admin.ev("document.querySelector('[data-sic-tick=\"15-17\"]').getAttribute('aria-checked')")) === "mixed");
  await setValue(admin, "[data-sic-find]", "roofing");
  await when(admin, "!!document.querySelector('[data-sic-tick=\"1761\"]')");
  check("found by a word, with what it sits under", (await admin.ev("!!document.querySelector('[data-sic-node=\"17\"]') && !document.querySelector('[data-sic-tick=\"1711\"]')")) === true);
  await tick(admin, "1761");
  await setValue(admin, "[data-sic-find]", "");
  await setValue(admin, "[data-request-title]", `${TAG} Contractors`);
  await when(admin, "!!document.querySelector('[data-employees-min=\"17\"]')");
  check("an employee size for each group picked", (await admin.ev("[...document.querySelectorAll('[data-employee-group]')].map((g) => g.dataset.employeeGroup).join()")) === "15,17");
  await setValue(admin, "[data-employees-min=\"17\"]", "10");
  await setValue(admin, "[data-employees-max=\"17\"]", "100");
  await admin.ev("[...document.querySelectorAll('[data-state-picker=\"States\"] button')].find((b) => b.textContent === 'AZ').click()");
  await setValue(admin, "[data-radius-miles]", "5");
  await setValue(admin, "[data-radius-zip]", "85201");
  await admin.ev("document.querySelector('[data-radius-find]').click()");
  const found = Number(await when(admin, "document.querySelector('[data-radius-found]')?.dataset.radiusFound ?? null"));
  check("a radius: the ZIPs within 5 miles of 85201, from the Census points", found > 3, String(found));
  // Counties and ZIPs as tags: a comma makes one.
  await setValue(admin, '[data-tag-input="include-counties"] [data-tag-text]', "Maricopa,");
  await setValue(admin, '[data-tag-input="exclude-zips"] [data-tag-text]', "85203, 852");
  check("a comma makes a tag: a county, a ZIP", Boolean(await when(admin, `!!document.querySelector('[data-tag-input="include-counties"] [data-tag="Maricopa"]')
    && !!document.querySelector('[data-tag-input="exclude-zips"] [data-tag="85203"]')`))
    && (await admin.ev(`document.querySelector('[data-tag-input="exclude-zips"] [data-tag-text]').value`)) === "852");
  await setValue(admin, '[data-tag-input="exclude-zips"] [data-tag-text]', "");
  await admin.ev("document.querySelector('[data-request-save]').click()");
  const id = Number(await when(admin, "location.pathname.match(/^\\/list-builder\\/(\\d+)$/)?.[1] ?? null"));
  check("saved: its page", id > 0, await admin.url());
  const r = one(`select company_id, sales_rep_id, source, title, criteria from public.list_requests where id = ${id}`);
  check("…kept with the client and its Sales Rep", r.company_id === company && r.sales_rep_id === MIKE && r.source === "staff" && r.title === `${TAG} Contractors`, JSON.stringify(r));
  check("…the group's codes and the one found", ["1521", "1522", "1531", "1541", "1542", "1761"].every((c) => r.criteria.sic.includes(c)) && r.criteria.sic.length === 6, JSON.stringify(r.criteria.sic));
  check("…the size for 17, the state, the radius's ZIPs less the one left out", r.criteria.employees["17"]?.min === 10 && r.criteria.employees["17"]?.max === 100
    && r.criteria.include.states.join() === "AZ" && r.criteria.include.counties.join() === "Maricopa" && r.criteria.zips.includes("85201") && !r.criteria.zips.includes("85203") && r.criteria.exclude.zips.join() === "85203", JSON.stringify(r.criteria));
  check("the Sales Rep is told", sql(`select count(*) from public.notifications where user_id = ${MIKE} and link = '/list-builder/${id}'`) === "1");

  section("Its page and its exports");
  await when(admin, "!!document.querySelector('[data-export-codes]')");
  check("by group, with the size", /10–100 employees/.test(await admin.ev("document.querySelector('[data-request-employees=\"17\"]')?.textContent ?? ''")));
  await admin.ev(`window.__csv = []; const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { b.text().then((t) => window.__csv.push(t)); return make(b); };
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) return; return click.call(this); }; true`);
  await admin.ev("document.querySelector('[data-export-codes]').click()");
  const codes = ((await until(() => admin.ev("window.__csv[0] ?? null"))) ?? "").replace(/^﻿/, "").trim().split(/\r\n/);
  check("SIC codes CSV: one to a line, ready for the vendor's site", codes[0] === "SIC Code,SIC Description" && codes.length === 7 && codes.some((l) => /^1761,"?Roofing/.test(l)), JSON.stringify(codes.slice(0, 3)));
  await admin.fill("[data-request-status]", "pulled");
  check("staff move it on: List pulled", Boolean(await until(() => sql(`select status from public.list_requests where id = ${id}`) === "pulled" || null)));

  section("A prospect, from a link");
  await admin.go("/list-builder", 6000);
  await when(admin, "!!document.querySelector('[data-link-make]')");
  await setValue(admin, "[data-link-label]", `${TAG} link`);
  await admin.ev("document.querySelector('[data-link-make]').click()");
  const token = await until(() => sql(`select coalesce((select token from public.list_request_links where label = ${lit(`${TAG} link`)}), '')`) || null);
  check("a link made, with its Sales Rep (whoever made it)", Boolean(token) && sql(`select sales_rep_id from public.list_request_links where token = ${lit(token)}`) === String(ADMIN));
  const prospect = await (await browser.newContext()).newPage({ width: 1440, height: 1000 });
  await prospect.go(`/request/${token}`, 8000);
  check("it opens without signing in", Boolean(await when(prospect, "!!document.querySelector('[data-list-builder=\"prospect\"]')")));
  await setValue(prospect, "[data-prospect=\"name\"]", `${TAG} Pat`);
  await setValue(prospect, "[data-prospect=\"company\"]", `${TAG} Agency`);
  await setValue(prospect, "[data-prospect=\"email\"]", "pat@example.test");
  await setValue(prospect, "[data-sic-find]", "wheat");
  await when(prospect, "!!document.querySelector('[data-sic-tick=\"0111\"]')");
  await tick(prospect, "0111");
  await prospect.ev("document.querySelector('[data-request-save]').click()");
  check("sent: thanked", Boolean(await when(prospect, "!!document.querySelector('[data-request-sent]')")));
  const p = one(`select id, source, sales_rep_id, prospect, criteria from public.list_requests where prospect->>'name' = ${lit(`${TAG} Pat`)}`);
  check("…kept as a prospect's, to the link's Sales Rep, wheat as 0111", p?.source === "prospect" && p.sales_rep_id === ADMIN && p.prospect.email === "pat@example.test" && p.criteria.sic.join() === "0111", JSON.stringify(p));
  check("…and the administrators told", Number(sql(`select count(*) from public.notifications where link = '/list-builder/${p.id}'`)) >= 1);
  const linkId = sql(`select id from public.list_request_links where token = ${lit(token)}`);
  await admin.ev(`document.querySelector('[data-link-toggle="${linkId}"]').click()`);
  await until(() => sql(`select active from public.list_request_links where id = ${linkId}`) === "f" || null);
  await prospect.go(`/request/${token}`, 5000);
  check("a link turned off is closed", Boolean(await when(prospect, "!!document.querySelector('[data-request-link-problem]')")));

  section("A client's own");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await client.go("/list-builder", 7000);
  check("they see their requests", Boolean(await when(client, `!!document.querySelector('[data-request="${id}"]')`)) && !(await client.ev(`!!document.querySelector('[data-request="${p.id}"]')`)));
  await client.go("/list-builder/new", 8000);
  await when(client, "!!document.querySelector('[data-sic-tree]')");
  check("no client to choose; what they asked for before is marked", !(await client.ev("!!document.querySelector('[data-request-client]')"))
    && (await client.ev("!!document.querySelector('[data-sic-node=\"15-17\"] [data-sic-before]')")));
  await setValue(client, "[data-sic-find]", "plumbing");
  await when(client, "!!document.querySelector('[data-sic-tick=\"1711\"]')");
  await tick(client, "1711");
  await client.ev("document.querySelector('[data-request-save]').click()");
  const cid = Number(await when(client, "location.pathname.match(/^\\/list-builder\\/(\\d+)$/)?.[1] ?? null"));
  const cr = one(`select company_id, source, status from public.list_requests where id = ${cid}`);
  check("…kept as theirs, from the client", cr.company_id === company && cr.source === "client" && cr.status === "new", JSON.stringify(cr));
  await sleep(100);
} finally {
  browser.close();
  sql(`update public.users set company_id = ${clientCompany} where id = ${CLIENT}`);
  sql(`delete from public.notifications where link in (select '/list-builder/' || id from public.list_requests where company_id = ${company} or prospect->>'name' like ${lit(`${TAG}%`)})`);
  sql(`delete from public.list_requests where company_id = ${company} or prospect->>'name' like ${lit(`${TAG}%`)}`);
  sql(`delete from public.list_request_links where label like ${lit(`${TAG}%`)}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("list builder");
