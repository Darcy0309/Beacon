/**
 * The report filters (client, project, rep): a long project name stays on
 * one line in the filter, cut short with "…" and the chevron still in view;
 * the list that opens shows every name in full; choosing one, with the
 * mouse or the keyboard, filters the report through the URL. X-Dates by
 * Month's projects, several at once (Sean, Oct 2026), the same.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const TAG = `FLT ${Date.now()}`;
// Longer than the client's longest ("HeartlandIns-MidwestPros_Appointments_2026").
const LONG = `${TAG} HeartlandIns-MidwestPros_Appointments_2026_Northern_Territories`;
const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const projectId = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(LONG)}, ${companyId}, (select id from public.project_types where code='APPT'), 1) returning id`));

const browser = await launchBrowser({ mouse: true });
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);

try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 900 });

  section("A long project name in the filter");
  await admin.go(`/reports/production?project=${projectId}`, 5000);
  const filter = () => admin.ev(`(() => { const b = document.querySelector('button[data-param="project"]'); if (!b) return null;
    const text = b.querySelector('.truncate'); const icon = b.querySelector('svg'); const br = b.getBoundingClientRect(), ir = icon.getBoundingClientRect();
    return { text: text.textContent, height: Math.round(br.height), cut: text.scrollWidth > text.clientWidth, ellipsis: getComputedStyle(text).textOverflow,
      lines: Math.round(text.getBoundingClientRect().height / parseFloat(getComputedStyle(text).lineHeight)), iconInside: ir.right <= br.right && ir.left >= br.left }; })()`);
  const f = await filter();
  check("the filter shows the chosen project", f?.text === LONG, f?.text);
  check("…on one line, the button's own height", f?.height === 32 && f.lines === 1, JSON.stringify(f));
  check("…cut short with an ellipsis", f?.cut && f.ellipsis === "ellipsis", JSON.stringify(f));
  check("…with the chevron still inside the button", f?.iconInside, JSON.stringify(f));
  check("no native <select> left for these filters", await admin.ev(`!document.querySelector('select[name="project"], select[name="client"]')`));
  await shot(admin, "filter-long");

  section("The list");
  await admin.mouseClick('button[data-param="project"]');
  check("clicking opens the list", await until(() => admin.ev(`!!document.querySelector('[role=menu]')`)));
  const items = await admin.ev(`[...document.querySelectorAll('[role=menuitemradio]')].map((i) => ({ text: i.textContent, checked: i.getAttribute('aria-checked') }))`);
  check("…every project in full, the chosen one checked", items.some((i) => i.text === LONG && i.checked === "true"), JSON.stringify(items.filter((i) => i.checked === "true")));
  check("…with “All projects” first", items[0]?.text === "All projects", items[0]?.text);
  const width = await admin.ev(`(() => { const m = document.querySelector('[role=menu]').getBoundingClientRect(); return { right: m.right, inWindow: m.right <= innerWidth && m.left >= 0 }; })()`);
  check("…inside the window", width.inWindow, JSON.stringify(width));
  await shot(admin, "filter-open");
  await admin.ev(`[...document.querySelectorAll('[role=menuitemradio]')].find((i) => i.textContent === 'All projects').click()`);
  check("choosing “All projects” clears the filter", await until(async () => !(await admin.url()).includes("project=")), await admin.url());

  section("With the keyboard");
  await admin.ev(`document.querySelector('button[data-param="project"]').focus()`);
  await admin.key("Enter");
  check("Enter opens the list", await until(() => admin.ev(`!!document.querySelector('[role=menu]')`)));
  await admin.key("ArrowDown");
  await sleep(100);
  const focused = await admin.ev(`document.activeElement?.textContent ?? ''`);
  await admin.key("Enter");
  const chosen = sql(`select id from public.projects where name = ${lit(focused)}`);
  check("arrow down and Enter choose a project", Boolean(chosen) && (await until(async () => (await admin.url()).includes(`project=${chosen}`))), `${focused} → ${await admin.url()}`);
  check("…and the list closes", await until(() => admin.ev(`!document.querySelector('[role=menu]')`)));

  check("…and the rep filter beside it", await admin.ev(`!!document.querySelector('button[data-param="rep"]')`));

  section("X-Dates by Month: several projects at once");
  await admin.go(`/reports/x-dates?project=${projectId}`, 5000);
  const multi = '[data-param-multi="project"] > button';
  const m = await admin.ev(`(() => { const b = document.querySelector('${multi}'); if (!b) return null; const t = b.querySelector('.truncate'), i = b.querySelector('svg');
    const br = b.getBoundingClientRect(), ir = i.getBoundingClientRect();
    return { text: t.textContent, height: Math.round(br.height), cut: t.scrollWidth > t.clientWidth, ellipsis: getComputedStyle(t).textOverflow, iconInside: ir.right <= br.right && ir.left >= br.left }; })()`);
  check("the same one-line button: the chosen project cut short, the chevron inside", m?.text === LONG && m.height === 32 && m.cut && m.ellipsis === "ellipsis" && m.iconInside, JSON.stringify(m));
  await admin.mouseClick(multi);
  const list = '[data-param-multi="project"] [role=listbox]';
  check("clicking opens the list", await until(() => admin.ev(`!!document.querySelector('${list}')`)));
  const opts = await admin.ev(`[...document.querySelectorAll('${list} [role=option]')].map((o) => ({ text: o.textContent.trim(), on: o.getAttribute('aria-selected') }))`);
  check("…“All” first, then every project in full, the chosen one ticked", opts[0]?.text === "All" && opts.some((o) => o.text === LONG && o.on === "true"), JSON.stringify(opts.slice(0, 2)));
  const box = await admin.ev(`(() => { const r = document.querySelector('${list}').getBoundingClientRect(); return { left: r.left, right: r.right, inWindow: r.right <= innerWidth && r.left >= 0 }; })()`);
  check("…inside the window", box.inWindow, JSON.stringify(box));
  const other = opts.find((o) => o.text !== LONG && o.text !== "All")?.text;
  await admin.click(`${list} [role=option]`, other);
  const otherId = sql(`select id from public.projects where name = ${lit(other)} and deleted_at is null order by id limit 1`);
  check("ticking another: both", await until(async () => { const q = new URL(await admin.url(), "http://x").searchParams.get("project") ?? ""; return q.split(",").sort().join() === [String(projectId), otherId].sort().join(); }), await admin.url());
  await admin.ev(`document.querySelector('${list} [data-option=""]').click()`);
  check("“All” clears them", await until(async () => !(await admin.url()).includes("project=")), await admin.url());
  await admin.key("Escape");
  check("Escape closes the list", await until(() => admin.ev(`!document.querySelector('${list}')`)));

  section("…with the keyboard");
  await admin.ev(`document.querySelector('${multi}').focus()`);
  await admin.key("Enter");
  check("Enter opens the list, its find box ready", await until(() => admin.ev(`document.activeElement?.getAttribute('aria-label') === 'Find Project'`)));
  await admin.fill(`${list} input`, TAG);
  check("…typing finds the project", await until(() => admin.ev(`[...document.querySelectorAll('${list} [role=option]')].length === 2`)));
  await admin.key("Tab");
  await admin.key("Tab");
  await admin.key("Enter");
  check("…Tab to it and Enter ticks it", await until(async () => new URL(await admin.url(), "http://x").searchParams.get("project") === String(projectId)), await admin.url());
} finally {
  browser.close();
  sql(`delete from public.projects where id = ${projectId}`);
  sql(`delete from public.companies where id = ${companyId}`);
}

finish("filters");
