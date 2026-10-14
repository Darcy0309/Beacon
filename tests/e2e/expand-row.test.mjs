/**
 * Cards that take more of their row while pointed at (.expand-row): on the
 * Clients page a chart tile grows from its neighbours on both sides, which
 * dim, and gives the room back when left, the row never changing height;
 * nothing moves on a narrower screen, where the tiles are not one row, nor
 * for someone who has asked for less motion. The project page's call
 * results and calendar do the same.
 *
 *   node tests/run.mjs tests/e2e/expand-row.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const browser = await launchBrowser({ mouse: true });
const boxes = (page, row) => page.ev(`[...document.querySelector(${JSON.stringify(row)}).children].map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), dim: getComputedStyle(c).filter !== 'none' }; })`);
const away = (page) => page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
try {
  section("Clients: a chart tile takes more of the row");
  const page = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1900, height: 950 });
  await page.go("/clients", 6000);
  const ROW = "[data-client-tiles]";
  await until(() => page.ev(`document.querySelectorAll('${ROW} > *').length === 4`));
  await sleep(600);
  const rest = await boxes(page, ROW);
  check("at rest: four tiles on one row, the two charts the widest", rest.length === 4 && rest[1].w > rest[0].w * 1.6 && rest[2].w === rest[1].w && rest[3].w > rest[0].w && new Set(rest.map((b) => b.h)).size === 1, JSON.stringify(rest));
  await page.hover('[data-trend-tile="appts"]');
  const grown = await until(async () => { const b = await boxes(page, ROW); return b[2].w > rest[2].w * 1.2 ? b : null; }, { timeout: 4000 });
  await sleep(700);
  const settled = await boxes(page, ROW);
  check("pointed at, the Appointments tile grows by a good fifth", Boolean(grown) && settled[2].w > rest[2].w * 1.2, JSON.stringify(settled));
  check("…outward to both sides: its left edge moves left, its right edge right", settled[2].x < rest[2].x && settled[2].x + settled[2].w > rest[2].x + rest[2].w, `${rest[2].x}+${rest[2].w} → ${settled[2].x}+${settled[2].w}`);
  check("…from its neighbours, each a little narrower, none under what it needs", [0, 1, 3].every((i) => settled[i].w < rest[i].w) && settled[1].w >= 290 && settled[0].w >= 150, JSON.stringify(settled.map((b) => b.w)));
  check("…the row as wide and as tall as before, so nothing below moves", Math.abs(settled.reduce((n, b) => n + b.w, 0) - rest.reduce((n, b) => n + b.w, 0)) <= 2 && settled.every((b, i) => b.h === rest[i].h), JSON.stringify(settled.map((b) => b.h)));
  check("…and its neighbours dim, it does not", settled[2].dim === false && [0, 1, 3].every((i) => settled[i].dim));
  check("its chart is redrawn to the new width", (await page.ev(`document.querySelector('[data-trend-tile="appts"] [data-trend-chart] svg').getBoundingClientRect().width`)) > rest[2].w * 1.1);
  if (SHOTS) await page.screenshot(`${SHOTS}/expand-row.png`);
  await away(page);
  check("left, it gives the room back", Boolean(await until(async () => JSON.stringify((await boxes(page, ROW)).map((b) => b.w)) === JSON.stringify(rest.map((b) => b.w)), { timeout: 4000 })), JSON.stringify(await boxes(page, ROW)));
  await page.hover('[data-client-statuses]');
  await sleep(900);
  check("a tile with little in it does not grow", JSON.stringify((await boxes(page, ROW)).map((b) => b.w)) === JSON.stringify(rest.map((b) => b.w)));
  await page.hover("[data-breakdown-tile]");
  check("the time zone and agency group tile does", Boolean(await until(async () => (await boxes(page, ROW))[3].w > rest[3].w * 1.2, { timeout: 4000 })));
  await away(page);

  section("Less motion, and narrower screens");
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await sleep(600);
  await page.hover('[data-trend-tile="leads"]');
  await sleep(900);
  check("someone who asked for less motion gets none: the tiles hold still", JSON.stringify((await boxes(page, ROW)).map((b) => b.w)) === JSON.stringify(rest.map((b) => b.w)), JSON.stringify(await boxes(page, ROW)));
  page.close();
  const narrow = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1100, height: 900 });
  await narrow.go("/clients", 6000);
  await sleep(600);
  const two = await boxes(narrow, ROW);
  await narrow.hover('[data-trend-tile="leads"]');
  await sleep(900);
  check("under a desktop's width the tiles are two to a row and nothing grows", new Set(two.map((b) => b.x)).size === 2 && JSON.stringify(await boxes(narrow, ROW)) === JSON.stringify(two.map((b, i) => ({ ...b, dim: false }))), JSON.stringify(two));
  narrow.close();

  section("A project: call results and the calendar");
  const project = sql("select p.id from public.projects p where p.deleted_at is null order by (select count(*) from public.leads l where l.project_id = p.id) desc limit 1");
  const proj = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1600, height: 950 });
  await proj.go(`/projects/${project}`, 6000);
  const PROW = ".expand-row[data-from=lg]";
  await until(() => proj.ev(`document.querySelectorAll('${PROW} > *').length === 2`));
  await proj.ev(`document.querySelector('${PROW}').scrollIntoView({ block: 'center' })`);
  await sleep(600);
  const before = await boxes(proj, PROW);
  check("at rest: the call results twice the calendar's width", Math.abs(before[0].w - before[1].w * 2) < 30 && before[0].h === before[1].h, JSON.stringify(before));
  await proj.hover("[data-calendar-tile]");
  const cal = await until(async () => { const b = await boxes(proj, PROW); return b[1].w > before[1].w * 1.25 ? b : null; }, { timeout: 4000 });
  check("pointed at, the calendar takes more of the row, the call results less", Boolean(cal) && cal[0].w < before[0].w, JSON.stringify(cal ?? await boxes(proj, PROW)));
  await proj.hover("[data-result-breakdown]");
  check("…and the call results take it back, and more", Boolean(await until(async () => (await boxes(proj, PROW))[0].w > before[0].w * 1.08, { timeout: 4000 })), JSON.stringify(await boxes(proj, PROW)));
} finally {
  browser.close();
}

finish("expand row");
