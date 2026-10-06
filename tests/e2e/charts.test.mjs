/**
 * Chart tooltips, in the app's own style (never the browser's title
 * tooltip): hovering a month on X-Dates by Month shows that month's figures
 * (and only that month's) above its column, the same numbers as the table,
 * with the colour under the pointer lit, inside the window; keyboard focus on
 * a colour shows it too. The Reports six-month bars do the same.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const browser = await launchBrowser({ mouse: true });
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const open = (page) => page.ev(`[...document.querySelectorAll('[role=tooltip][data-tip-open]')].filter((t) => getComputedStyle(t).visibility === 'visible').map((t) => t.dataset.tipOpen)`);
const tipText = (page) => page.ev(`(() => { const t = document.querySelector('[role=tooltip][data-tip-open]'); if (!t) return null;
  return { title: t.firstElementChild.textContent, lines: [...t.querySelectorAll('[data-tip-line]')].map((l) => ({ key: l.dataset.tipLine, text: l.innerText.replace(/\\s+/g, ' '), lit: l.className.includes('bg-foreground/10') })),
    total: t.querySelector('.border-t')?.innerText.replace(/\\s+/g, ' ') ?? null }; })()`);
/** Where the open tip sits against what it points at, and the window. */
const placement = (page, anchorSelector) => page.ev(`(() => { const t = document.querySelector('[role=tooltip][data-tip-open]').getBoundingClientRect();
  const a = document.querySelector(${JSON.stringify(anchorSelector)}).getBoundingClientRect();
  return { above: t.bottom <= a.top + 0.5, centred: Math.abs((t.left + t.width / 2) - (a.left + a.width / 2)) < 2 || t.left <= 8.5 || t.right >= innerWidth - 8.5,
    inWindow: t.left >= 0 && t.right <= innerWidth && t.top >= 0 && t.bottom <= innerHeight }; })()`);
/** The middle of an element, near its top: where a pointer rests on a bar. */
const pointAt = (page, selector) => page.ev(`(() => { const s = document.querySelector(${JSON.stringify(selector)}); s.scrollIntoView({ block: 'center' });
  const r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(8, r.height / 2) }; })()`);

try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1600, height: 1000 });

  section("X-Dates by Month");
  await admin.go("/reports/x-dates", 5000);
  // The month with the most renewals, which has every colour to hover.
  const month = Number(sql(`select extract(month from public.lead_renewal_date(l.id))::int from public.leads l
    where public.lead_renewal_date(l.id) is not null group by 1 order by count(*) desc, 1 limit 1`));
  const name = MONTHS[month - 1];
  {
    check("no tooltip until a month is hovered", JSON.stringify(await open(admin)) === "[]");
    check("…and no browser title tooltips on the chart", await admin.ev(`!document.querySelector('[data-month-column] [title], [data-month-column][title]')`));
    await admin.hover(await pointAt(admin, `[data-month-column="${month}"] a[data-seg="viable"]`));
    check(`hovering ${name} shows its figures, and only those`, await until(async () => JSON.stringify(await open(admin)) === JSON.stringify([String(month)])), JSON.stringify(await open(admin)));

    const tip = await tipText(admin);
    const row = await admin.ev(`[...document.querySelectorAll('tbody tr')].find((r) => r.cells[0]?.innerText.startsWith(${JSON.stringify(name)}))?.innerText.split('\\t').map((s) => s.trim())`);
    // The table reads: month, total, appointments, off the list, viable left.
    const [, total, appts, off, viable] = row ?? [];
    const value = (key) => tip?.lines.find((l) => l.key === key)?.text.match(/ ([\d,]+) \d+%$/)?.[1];
    check("the tooltip names the month", tip?.title === name, tip?.title);
    check("…with the table's numbers", value("viable") === viable && value("off") === off && value("appointment") === appts && tip.total === `Total ${total}`,
      `${JSON.stringify(tip)} vs ${JSON.stringify(row)}`);
    check("…the colour under the pointer lit", JSON.stringify(tip.lines.filter((l) => l.lit).map((l) => l.key)) === '["viable"]', JSON.stringify(tip.lines));
    const at = await placement(admin, `[data-month-column="${month}"] [data-tip-anchor]`);
    check("…above its column, centred on it, inside the window", at.above && at.centred && at.inWindow, JSON.stringify(at));
    await shot(admin, "xdate-tooltip");

    await admin.hover(await pointAt(admin, `[data-month-column="${month}"] a[data-seg="off"]`));
    check("moving onto another colour lights that one", await until(async () => JSON.stringify((await tipText(admin))?.lines.filter((l) => l.lit).map((l) => l.key)) === '["off"]'));
    await admin.hover({ x: 5, y: 5 });
    check("moving away hides it", await until(async () => JSON.stringify(await open(admin)) === "[]"));

    // The first and last months: the tip is pushed in from the window's edge, never cut off.
    for (const edge of [1, 12]) {
      await admin.hover(await pointAt(admin, `[data-month-column="${edge}"] [data-tip-anchor]`));
      await until(async () => (await open(admin)).includes(String(edge)));
      const e = await placement(admin, `[data-month-column="${edge}"] [data-tip-anchor]`);
      check(`${MONTHS[edge - 1]}'s tip stays inside the window`, e.inWindow && e.above, JSON.stringify(e));
    }
    await admin.hover({ x: 5, y: 5 });

    await admin.ev(`document.querySelector('[data-month-column="${month}"] a[data-seg]').focus()`);
    await sleep(250);
    check("a colour with keyboard focus shows its month too", JSON.stringify(await open(admin)) === JSON.stringify([String(month)]), JSON.stringify(await open(admin)));
    await admin.ev("document.activeElement.blur()");
  }

  section("Reports: six months of leads and appointments");
  await admin.go("/reports", 5000);
  {
    check("no browser title tooltips on the bars", await admin.ev(`!document.querySelector('[data-months-chart] [title]')`));
    const key = await admin.ev(`[...document.querySelectorAll('[data-months-chart] [data-tip]')].at(-2)?.dataset.tip`);
    await admin.hover(await pointAt(admin, `[data-months-chart] [data-tip="${key}"] [data-tip-row="leads"]`));
    check("hovering a month shows its figures", await until(async () => JSON.stringify(await open(admin)) === JSON.stringify([key])), JSON.stringify(await open(admin)));
    const tip = await tipText(admin);
    const [y, m] = key.split("-").map(Number);
    check("…named with its month and year", tip?.title === `${MONTHS[m - 1]} ${y}`, tip?.title);
    check("…leads and appointments, the bar under the pointer lit",
      tip?.lines.map((l) => l.key).join() === "leads,appts" && tip.lines.find((l) => l.key === "leads").lit, JSON.stringify(tip?.lines));
    const at = await placement(admin, `[data-months-chart] [data-tip="${key}"] [data-tip-anchor]`);
    check("…above the taller bar, inside the window", at.above && at.inWindow, JSON.stringify(at));
    await shot(admin, "reports-tooltip");
  }
} finally {
  browser.close();
}

finish("charts");
