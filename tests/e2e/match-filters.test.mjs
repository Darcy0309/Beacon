/**
 * The Match Tool's projects, filtered and sorted (Sean, Nov 2026: "This list of projects is going to get very
 * big - can we set this up to filter by client, project, owed (high/low), done % (high/low), matches
 * (high/low), etc…and by sales rep? Also a search by client name box? And have this header lock as you scroll").
 *
 *   node tests/run.mjs tests/e2e/match-filters.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `MF-E2E ${Date.now()}`;
const MIKE = Number(sql(`select id from public.users where email = 'mike@beacon.test'`));
const type = (code) => sql(`select id from public.project_types where code = '${code}'`);
const company = (name, rep = "null") => Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} ${name}`)}, ${rep}) returning id`));
const ALPHA = company("Alpha Ins", MIKE);
const BRAVO = company("Bravo Ins");
const project = (name, co, goal) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, lead_goal, start_date, end_date)
  values (${lit(`${TAG} ${name}`)}, ${co}, ${type("DBDV")}, 1, ${goal}, current_date - 30, current_date + 60) returning id`));
const P1 = project("Alpha Churches", ALPHA, 100);
const P2 = project("Alpha Trucking", ALPHA, 900);
const P3 = project("Bravo Roofing", BRAVO, 400);
const mine = [P1, P2, P3].map(String);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 900 });
  await admin.go("/reports/matches", 8000);
  await until(() => admin.ev(`!!document.querySelector('[data-match-row="${P3}"]')`), { timeout: 15000 });
  const order = () => admin.ev(`[...document.querySelectorAll('[data-match-row]')].map((r) => r.dataset.matchRow)`);
  const ours = async () => (await order()).filter((id) => mine.includes(id));

  section("Search");
  await admin.fill("[data-match-search]", `${TAG} alpha`);
  check("by client or project name: only those", JSON.stringify(await until(async () => ((await order()).length === 2 ? order() : null))) === JSON.stringify([String(P1), String(P2)]), JSON.stringify(await order()));
  await admin.fill("[data-match-search]", "trucking");
  check("…a word of a project's name", (await ours()).join() === String(P2), JSON.stringify(await ours()));
  await admin.click("[data-match-clear]");

  section("Client and Sales Rep");
  await admin.fill("[data-match-client]", `${TAG} Bravo Ins`);
  check("a client's projects", JSON.stringify(await order()) === JSON.stringify([String(P3)]), JSON.stringify(await order()));
  await admin.fill("[data-match-client]", "");
  await admin.fill("[data-match-rep]", "Mike Preston");
  const mikes = await order();
  check("a Sales Rep's clients' projects", mikes.includes(String(P1)) && mikes.includes(String(P2)) && !mikes.includes(String(P3)), JSON.stringify(mikes));
  check("…the Sales Rep under each client", (await admin.ev(`document.querySelector('[data-match-row="${P1}"] td')?.innerText`))?.includes("Mike Preston"));
  await admin.fill("[data-match-rep]", "__none");
  check("…or those with none", (await order()).includes(String(P3)) && !(await order()).includes(String(P1)));
  await admin.fill("[data-match-rep]", "");
  await admin.fill("[data-match-search]", TAG);

  section("Sorted");
  await admin.fill("[data-match-sort]", "owed:desc");
  check("Owed, high to low", (await ours()).join() === [P2, P3, P1].join(), JSON.stringify(await ours()));
  await admin.fill("[data-match-sort]", "owed:asc");
  check("…low to high", (await ours()).join() === [P1, P3, P2].join(), JSON.stringify(await ours()));
  await admin.click('[data-match-sort-by="project"]');
  check("a column's heading sorts by it (Project, A–Z)", (await ours()).join() === [P1, P2, P3].join(), JSON.stringify(await ours()));
  await admin.click('[data-match-sort-by="project"]');
  check("…again, the other way", (await ours()).join() === [P3, P2, P1].join(), JSON.stringify(await ours()));
  check("…Sort by follows", (await admin.ev(`document.querySelector('[data-match-sort]').value`)) === "project:desc");

  section("The headings stay at the top");
  await admin.fill("[data-match-search]", "");
  // Enough rows to scroll: the list as it is, its box scrolled down.
  const stuck = await admin.ev(`(() => { const box = document.querySelector('[data-match-scroll]'); const head = document.querySelector('[data-match-head]');
    box.scrollTop = box.scrollHeight; return { scrolled: box.scrollTop > 0, gap: Math.round(head.getBoundingClientRect().top - box.getBoundingClientRect().top), fits: box.getBoundingClientRect().bottom <= innerHeight + 1 }; })()`);
  check("scrolled down the list, the headings still at its top", stuck && (!stuck.scrolled || Math.abs(stuck.gap) <= 1), JSON.stringify(stuck));
} finally {
  browser.close();
  sql(`delete from public.projects where id in (${P1}, ${P2}, ${P3})`);
  sql(`delete from public.companies where id in (${ALPHA}, ${BRAVO})`);
}

finish("match filters");
