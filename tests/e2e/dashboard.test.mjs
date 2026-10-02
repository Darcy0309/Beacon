/**
 * The dashboard in a real browser: the Lead Volume chart's periods, drawn at
 * its real width; figures counting up and charts rising as they appear; the
 * sidebar's scrollbar showing only on hover; the sign-out arrows; and the
 * chart falling back to eight weeks where lead_volume_daily() is missing.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const browser = await launchBrowser();
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);
const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();

const CHART = "svg[aria-label^='New leads per']";
const heading = (page) => page.ev(`[...document.querySelectorAll('.eyebrow')].find((e) => /Lead Volume/i.test(e.textContent))?.textContent ?? ''`);
const pressed = (page) => page.ev(`document.querySelector('[role=group][aria-label=Period] [aria-pressed=true]')?.textContent ?? ''`);
// A label followed by its number ("Total 1,234"), not a tile whose name only starts the same ("Total Leads").
const figure = (page, label) => page.ev(`[...document.querySelectorAll('span')].find((s) => /^${label} [\\d,]/.test(s.textContent))?.textContent.slice(${label.length + 1}) ?? ''`);
const num = (s) => Number(String(s).replace(/[^\d.]/g, ""));
// The same calendar days the chart groups by (the business's, business_tz()), counted in the database.
const leadsSince = (since) => Number(sql(`select count(*) from public.leads where (coalesce(lead_date, created_at) at time zone public.business_tz())::date between ${since} and (now() at time zone public.business_tz())::date`));

try {
  section("Lead Volume chart");
  await admin.ev("localStorage.removeItem('lighthouse:lead-volume-range')");
  await admin.go("/");
  check("defaults to the last two months", /Last 2 months/i.test(await heading(admin)), await heading(admin));
  check("offers 1M, 2M, 6M and 1Y", (await admin.ev(`[...document.querySelectorAll('[role=group][aria-label=Period] button')].map((b) => b.textContent).join(',')`)) === "1M,2M,6M,1Y");
  check("2M is the one pressed", (await pressed(admin)) === "2M");

  // Not stretched: the drawing is exactly as wide as the space it is shown in.
  const geometry = () => admin.ev(`(() => { const s = document.querySelector("${CHART}"); const r = s.getBoundingClientRect();
    const texts = [...s.querySelectorAll('text')].map((t) => t.getBBox());
    return { shown: Math.round(r.width), drawn: s.viewBox.baseVal.width, box: Math.round(s.parentElement.getBoundingClientRect().width),
      stretch: s.getAttribute('preserveAspectRatio'), outside: texts.filter((b) => b.x < -0.5 || b.x + b.width > s.viewBox.baseVal.width + 0.5).length }; })()`);
  let g = await geometry();
  check("drawn at its real width, one unit to a pixel", g.shown === g.drawn && g.shown === g.box && g.stretch !== "none", JSON.stringify(g));
  check("no label runs off either edge", g.outside === 0, `${g.outside} outside`);

  await admin.click("[role=group][aria-label=Period] button", "1Y");
  await sleep(1400);
  check("1Y shows the last year", /Last year/i.test(await heading(admin)) && (await pressed(admin)) === "1Y");
  const yearSince = "(date_trunc('month', now() at time zone public.business_tz()) - interval '11 months')::date";
  check("…its total matches the database, month by month", num(await figure(admin, "Total")) === leadsSince(yearSince), `${await figure(admin, "Total")} vs ${leadsSince(yearSince)}`);
  check("…twelve monthly points", (await admin.ev(`document.querySelector("${CHART}").getAttribute('aria-label')`)).startsWith("New leads per month"));

  await admin.click("[role=group][aria-label=Period] button", "1M");
  await sleep(1400);
  const monthSince = "((now() at time zone public.business_tz())::date - 29)";
  check("1M totals the last 30 days by day", num(await figure(admin, "Total")) === leadsSince(monthSince) && /per day/.test(await admin.ev(`document.querySelector("${CHART}").getAttribute('aria-label')`)),
    `${await figure(admin, "Total")} vs ${leadsSince(monthSince)}`);
  await admin.click("[role=group][aria-label=Period] button", "6M");
  await sleep(1400);
  check("6M shows the last six months by week", /Last 6 months/i.test(await heading(admin)));
  g = await geometry();
  check("still not stretched, and labels inside", g.shown === g.drawn && g.outside === 0, JSON.stringify(g));

  await admin.go("/");
  check("the period picked is remembered", (await pressed(admin)) === "6M" && /Last 6 months/i.test(await heading(admin)));

  await admin.hover(CHART);
  check("hovering shows a readout", await until(() => admin.ev(`[...document.querySelectorAll('div')].some((d) => /^\\d[\\d,]* leads\\nWeek of /.test(d.innerText))`), { timeout: 2000 }));
  await shot(admin, "dashboard-chart");

  section("Figures and charts arriving");
  // Leave and come back through the sidebar, sampling the first tile as it arrives.
  await admin.go("/leads");
  await admin.click("aside a[href='/'], nav a[href='/']");
  const samples = [];
  const began = Date.now();
  while (Date.now() - began < 3500) {
    const v = await admin.ev(`document.querySelector('.stat-value [data-count-up]')?.textContent ?? null`);
    if (v !== null && samples.at(-1) !== v) samples.push(v);
    await sleep(30);
  }
  const final = num(samples.at(-1));
  check("tile figures count up to their value", samples.length > 2 && samples.slice(0, -1).some((s) => num(s) < final) && final > 0, samples.join(" → "));
  const signed = samples.map((s) => Number(s.replace(/[^\d.-]/g, "")));
  check("…only ever upwards, from zero", signed.every((n, i) => n >= 0 && (i === 0 || n >= signed[i - 1])), samples.join(" → "));
  check("…keeping their format (thousands commas)", final < 1000 || /,/.test(samples.at(-1)), samples.at(-1));
  const anims = await admin.ev(`({ rise: [...document.querySelectorAll('.animate-rise')].map((e) => getComputedStyle(e).animationName)[0],
    grow: [...document.querySelectorAll('.animate-grow-width')].map((e) => getComputedStyle(e).animationName)[0] })`);
  check("sparklines rise and bars grow", anims.rise === "rise" && anims.grow === "grow-width", JSON.stringify(anims));
  check("every counted figure ends visible", await admin.ev(`[...document.querySelectorAll('[data-count-up]')].every((e) => e.hasAttribute('data-counted') && getComputedStyle(e).visibility === 'visible')`));

  section("Sidebar");
  const nav = "aside nav";
  await admin.hover({ x: 900, y: 500 });
  await sleep(200);
  const hidden = await admin.ev(`getComputedStyle(document.querySelector("${nav}")).scrollbarColor`);
  await admin.hover(nav);
  await sleep(200);
  const shown = await admin.ev(`getComputedStyle(document.querySelector("${nav}")).scrollbarColor`);
  check("scrollbar hidden until the mouse is over the sidebar", /^(transparent|rgba\(0, 0, 0, 0\)) (transparent|rgba\(0, 0, 0, 0\))$/.test(hidden) && !/^(transparent|rgba\(0, 0, 0, 0\)) /.test(shown), `${hidden} → ${shown}`);

  const OUT = "button[aria-label='Sign out']";
  const arrows = () => admin.ev(`[...document.querySelectorAll("${OUT} .signout-arrow")].map((e) => getComputedStyle(e).animationName).join(',')`);
  check("sign-out arrows still at rest", (await arrows()) === "none,none", await arrows());
  await admin.hover(OUT);
  await sleep(300);
  check("…and flowing right on hover", (await arrows()) === "arrow-flow,arrow-flow", await arrows());
  await shot(admin, "signout-hover");

  section("Client dashboard and phone width");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage();
  await client.go("/");
  check("client keeps the six-month delivery bars", /Delivered/i.test(await client.text()) && (await client.ev(`document.querySelectorAll('.animate-grow-height').length`)) > 0);
  const phone = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 390, height: 844 });
  await phone.go("/", 4500);
  const overflow = await phone.ev("document.documentElement.scrollWidth - document.documentElement.clientWidth");
  check("no sideways scrolling on a phone", overflow <= 0, `overflow ${overflow}px`);
  const pg = await phone.ev(`(() => { const s = document.querySelector("${CHART}"); return { shown: Math.round(s.getBoundingClientRect().width), drawn: s.viewBox.baseVal.width }; })()`);
  check("the chart fits the phone, not squeezed", pg.shown === pg.drawn && pg.shown < 390, JSON.stringify(pg));
  await shot(phone, "dashboard-phone");

  section("Before the database function exists");
  sql("revoke execute on function public.lead_volume_daily(int) from authenticated");
  try {
    await admin.go("/");
    check("the dashboard still loads", /Command Center/i.test(await admin.text()) && !/Something went wrong/i.test(await admin.text()));
    check("…with the eight-week chart instead", /Last 8 Weeks/i.test(await heading(admin)) && !(await admin.ev(`!!document.querySelector('[role=group][aria-label=Period]')`)));
  } finally {
    sql("grant execute on function public.lead_volume_daily(int) to authenticated");
  }
} finally {
  browser.close();
}

finish("dashboard");
