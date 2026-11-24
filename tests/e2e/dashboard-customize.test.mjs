/**
 * A customizable dashboard (Sean, Nov 2026: "Is it possible to make the dashboard customizable … so each person can
 * set it up how they like?"): each section shown or hidden, collapsed to its title, moved, and put full width or in a
 * column; kept to the person's login; Back to default. Customized in Settings (an administrator: their own, and each
 * kind's default, which a manager's starts from) and under My Profile › Preferences (everyone), not on the dashboard.
 *
 *   node tests/run.mjs tests/e2e/dashboard-customize.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const uid = (email) => sql(`select id from public.users where email = '${email}'`);
const ADMIN = uid("admin@beacon.test");
const SEAN = uid("sean@beacon.test");
const CLIENT = uid("client@beacon.test");
const stored = (who, kind) => sql(`select coalesce((select layout::text from public.dashboard_layouts where ${who ? `user_id = ${who}` : "user_id is null"} and kind = '${kind}'), '')`);
sql(`delete from public.dashboard_layouts where user_id in (${ADMIN}, ${SEAN}, ${CLIENT}) or user_id is null`);

const order = (page) => page.ev(`[...document.querySelectorAll('[data-dash-section], [data-collapsed-section]')].map((s) => s.dataset.dashSection ?? 'collapsed:' + s.dataset.collapsedSection)`);
const row = (id) => `[data-customize-dialog] [data-customize-section="${id}"]`;
// A controlled <select>'s new value, as React hears it.
const pick = (page, sel, value) => page.ev(`(() => { const el = document.querySelector('${sel}'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '${value}'); el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; })()`);
// An administrator's: in Settings, on the page. Anyone's: My Profile › Preferences, in a dialog.
const customize = async (page, where = "/profile") => {
  await page.go(where, 7000);
  if (where === "/profile") {
    await until(() => page.ev(`!!document.querySelector('[data-customize-dashboard]')`), { timeout: 20000 });
    await page.click("[data-customize-dashboard]");
  }
  await until(() => page.ev(`!!document.querySelector('[data-customize-dialog] [data-customize-save]')`), { timeout: 20000 });
};
const saved = async (page, toast) => { await page.click("[data-customize-dialog] [data-customize-save]"); return page.waitToast(toast, 8000); };

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go("/", 9000);

  section("An administrator's dashboard, as it first is");
  const first = await until(() => order(admin).then((o) => (o?.length ? o : null)), { timeout: 20000 });
  check("its sections in their first order (Call Activity only with the phone line)", JSON.stringify(first.filter((x) => x !== "calls")) === JSON.stringify(["tiles", "chart", "recent", "schedule", "reps", "production"]), JSON.stringify(first));
  check("…the chart on the left, the schedule on the right", await admin.ev(`!!document.querySelector('[data-dash-column="left"] [data-dash-section="chart"]') && !!document.querySelector('[data-dash-column="right"] [data-dash-section="schedule"]')`));

  check("no Customize on the dashboard itself", !(await admin.ev(`!!document.querySelector('[data-customize-dashboard], [data-customize-dialog]')`)));

  section("Customized in Settings: hidden, collapsed, moved, placed");
  await customize(admin, "/settings/dashboard");
  await admin.click(`${row("reps")} [data-show]`);
  await admin.click(`${row("chart")} [data-collapse]`);
  for (let i = 0; i < 5; i++) await admin.click(`${row("production")} [data-move-up]`);
  await pick(admin, `${row("schedule")} [data-place]`, "left");
  check("…saved", /Your dashboard is saved/.test((await saved(admin, /saved/)) ?? ""));
  await admin.go("/", 9000);
  const after = await until(() => order(admin).then((o) => (o?.[0] === "production" ? o : null)), { timeout: 15000 });
  check("Daily Production first; Appointments by Rep gone; the chart a title bar", after?.[0] === "production" && !after.includes("reps") && after.includes("collapsed:chart"), JSON.stringify(after));
  check("…the schedule in the left column, alone so full width", await admin.ev(`(() => { const c = document.querySelector('[data-dash-section="schedule"]')?.closest('[data-dash-column]'); return c?.dataset.dashColumn === 'left' && c.parentElement.children.length === 1; })()`));
  const kept = JSON.parse(stored(ADMIN, "admin") || "{}");
  check("…kept to their login", kept.order?.[0] === "production" && kept.hidden?.includes("reps") && kept.collapsed?.includes("chart") && kept.place?.schedule === "left", JSON.stringify(kept));

  section("Expand");
  await admin.click('[data-expand-section="chart"]');
  check("the chart open again, and kept open", Boolean(await until(() => admin.ev(`!!document.querySelector('[data-dash-section="chart"]')`), { timeout: 15000 }))
    && Boolean(await until(() => !JSON.parse(stored(ADMIN, "admin")).collapsed.includes("chart"))));

  section("A default for account managers");
  await customize(admin, "/settings/dashboard");
  await pick(admin, "[data-customize-dialog] [data-customize-target]", "default:manager");
  await until(() => admin.ev(`!!document.querySelector('${row("team")}')`));
  await admin.click(`${row("team")} [data-show]`);
  check("…saved", /default layout is saved/.test((await saved(admin, /default/)) ?? ""));
  check("…as the managers' default", JSON.parse(stored(null, "manager") || "{}").hidden?.includes("team"));
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go("/", 9000);
  const seanOrder = await until(() => order(sean).then((o) => (o?.length ? o : null)), { timeout: 20000 });
  check("a manager's dashboard starts from it: no Daily Team Production", !seanOrder.includes("team") && seanOrder.includes("developed"), JSON.stringify(seanOrder));

  section("A manager's own (My Profile), and back to the default");
  await customize(sean);
  check("their own dashboard only", !(await sean.ev(`!!document.querySelector('[data-customize-dialog] [data-customize-target]')`)));
  await sean.click(`${row("team")} [data-show]`);
  await saved(sean, /saved/);
  await sean.go("/", 9000);
  check("Daily Team Production back for them", Boolean(await until(() => order(sean).then((o) => o?.includes("team")), { timeout: 15000 })));
  await customize(sean);
  await sean.click("[data-customize-dialog] [data-customize-reset]");
  await sean.waitToast(/back to the default/, 8000);
  await sean.go("/", 9000);
  check("Back to default: the administrators' again", Boolean(await until(() => order(sean).then((o) => o && !o.includes("team")), { timeout: 15000 })) && stored(SEAN, "manager") === "");

  section("Viewing a manager's dashboard");
  await admin.go(`/?view=${SEAN}`, 9000);
  check("as they see it, nothing to customize there", Boolean(await until(() => order(admin).then((o) => o?.length), { timeout: 20000 }))
    && !(await admin.ev(`!!document.querySelector('[data-customize-dashboard]')`)));

  section("A client's");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await client.go("/", 9000);
  const co = await until(() => order(client).then((o) => (o?.length ? o : null)), { timeout: 20000 });
  check("its sections", JSON.stringify(co) === JSON.stringify(["tiles", "pipeline", "schedule", "activity"]), JSON.stringify(co));
  await customize(client);
  check("no defaults to set", !(await client.ev(`!!document.querySelector('[data-customize-dialog] [data-customize-target]')`)));
  await client.click(`${row("activity")} [data-collapse]`);
  await saved(client, /saved/);
  await client.go("/", 9000);
  check("Recent Activity collapsed", Boolean(await until(() => client.ev(`!!document.querySelector('[data-collapsed-section="activity"]')`), { timeout: 15000 })));
  await sleep(200);
} finally {
  browser.close();
  sql(`delete from public.dashboard_layouts where user_id in (${ADMIN}, ${SEAN}, ${CLIENT}) or user_id is null`);
}

finish("dashboard customize");
