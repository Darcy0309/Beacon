/**
 * Industries in the Lead Explorer as SIC codes (Sean, Oct 2026): the
 * Industry filter and the By Industry card read "<code> – <description>"
 * (a six-digit code by its four-digit code's description when the list has
 * no other), in code order; typing what a business does finds its code; the
 * card scrolls in place rather than opening down the page.
 *
 * Removes everything it made.
 *
 *   node tests/run.mjs tests/e2e/explore-industry.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `EXI ${Date.now()}`;
const description = (code) => sql(`select coalesce(description, '') from public.sic_codes where code = ${lit(code)}`);
const EATING = description("5812");
const PLUMBING = description("1711");
// Codes on leads must be on the SIC list: one six-digit code its four-digit code describes. Any added here go again after.
const added = [];
const made = ["5812", "1711-04", "1711-04", "0742"].map((code, i) => {
  if (sql(`select count(*) from public.sic_codes where code = ${lit(code)}`) === "0") {
    sql(`insert into public.sic_codes (code) values (${lit(code)})`);
    added.push(code);
  }
  return Number(sql(`insert into public.leads (company_name, sic_code, state) values (${lit(`${TAG} Co ${i}`)}, ${lit(code)}, 'AZ') returning id`));
});

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1100 });
  await admin.go("/explore", 6000);

  section("The Industry filter");
  await admin.ev(`[...document.querySelectorAll('button[aria-haspopup="listbox"]')].find((b) => b.previousElementSibling?.textContent.trim() === 'Industry')?.click()`);
  const options = await until(async () => { const o = await admin.ev(`[...document.querySelectorAll('[role=listbox] [role=option]')].map((o) => o.querySelector('[title]')?.textContent ?? '')`); return o.length ? o : null; });
  check("a code with its own description reads both", EATING === "" || options.includes(`5812 – ${EATING}`), JSON.stringify(options?.slice(0, 12)));
  check("…a six-digit code by its four-digit code's description", PLUMBING === "" || options.includes(`1711-04 – ${PLUMBING}`), JSON.stringify(options?.filter((o) => o.startsWith("1711"))));
  const codes = (options ?? []).map((o) => o.split(" – ")[0]);
  const sorted = [...codes].sort((a, b) => a.replace(/\D/g, "").localeCompare(b.replace(/\D/g, "")) || a.localeCompare(b));
  check("…in code order", JSON.stringify(codes) === JSON.stringify(sorted), JSON.stringify(codes.slice(0, 15)));
  if (EATING) {
    await admin.fill('[role=listbox] input[aria-label="Filter Industry"]', EATING.slice(0, 7));
    const found = await until(async () => { const o = await admin.ev(`[...document.querySelectorAll('[role=listbox] [role=option]')].map((o) => o.querySelector('[title]')?.textContent ?? '')`); return o.some((x) => x.startsWith("5812")) ? o : null; });
    check("typing what a business does finds its code", Boolean(found), JSON.stringify(found));
  }

  section("The By Industry card");
  const card = await admin.ev(`(() => { const c = document.querySelector('[data-breakdown="By Industry"]'); return { text: c.innerText, scroll: !!c.querySelector('[data-breakdown-scroll]'), more: /Show \\d+ more/.test(c.innerText) }; })()`);
  check("its rows read code and description", PLUMBING === "" || card.text.includes(`1711-04 – ${PLUMBING}`), card.text.slice(0, 300));
  check("…scrolling in place: no Show N more", !card.more && card.scroll, JSON.stringify({ scroll: card.scroll, more: card.more }));
  const rows = await admin.ev(`[...document.querySelectorAll('[data-breakdown="By Industry"] [data-list-row] .truncate')].map((e) => e.textContent.trim()).filter(Boolean)`);
  const rowCodes = rows.filter((r) => r !== "No SIC code").map((r) => r.split(" – ")[0]);
  check("…in code order, the leads with no code last",
    JSON.stringify(rowCodes) === JSON.stringify([...rowCodes].sort((a, b) => a.replace(/\D/g, "").localeCompare(b.replace(/\D/g, "")) || a.localeCompare(b))) && (!rows.includes("No SIC code") || rows[rows.length - 1] === "No SIC code"), JSON.stringify(rows.slice(0, 10)));
} finally {
  browser.close();
  sql(`delete from public.leads where id in (${made.join(",")})`);
  if (added.length) sql(`delete from public.sic_codes where code in (${added.map(lit).join(",")})`);
}
finish("explore industry");
