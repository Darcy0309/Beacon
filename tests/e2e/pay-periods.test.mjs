/**
 * The business's own pay periods, end to end: an administrator chooses a
 * custom schedule in Settings and enters the periods (each new one starts
 * the day after the last), with their pay dates and the days closed or
 * optional; work days count weekdays less the closed ones; an overlapping
 * period is refused. An account manager then sees the schedule on Pay &
 * Hours, today's period marked, and the page follows it: this pay period,
 * paid on its date, and any period opened from the list.
 *
 * Works on the periods around today and puts the settings back.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const before = sql("select coalesce(value::text, '') from public.app_settings where key = 'time_tracking'");
const today = sql("select ((now() at time zone public.business_tz())::date)::text");
const add = (iso, n) => sql(`select (${lit(iso)}::date + ${n})::text`);
// A period around today, and the one after it.
const FIRST = { from: add(today, -3), to: add(today, 10), pay: add(today, 12) };
const SECOND = { from: add(today, 11), to: add(today, 25), pay: add(today, 27) };
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const weekdays = (from, to, closed = []) => Number(sql(`select count(*) from generate_series(${lit(from)}::date, ${lit(to)}::date, interval '1 day') d
  where extract(isodow from d) < 6 and d::date <> all(${lit(`{${closed.join(",")}}`)}::date[])`));
// Any weekday in the first period, to close, and another to make optional.
const days = sql(`select string_agg(d::date::text, ',' order by d) from generate_series(${lit(FIRST.from)}::date, ${lit(FIRST.to)}::date, interval '1 day') d
  where extract(isodow from d) < 6`).split(",");
const OPTIONAL = days[1];
const CLOSED = days[3];
const clean = () => sql(`delete from public.pay_periods where starts_on between ${lit(add(today, -40))} and ${lit(add(today, 60))}`);
clean();

const browser = await launchBrowser();
/** Type a date into a date picker of the open form, as a person would ("10/5/2026", then Tab). */
async function setDate(page, label, iso) {
  const field = `[data-pay-period-form] input[aria-label="${label}"]`;
  await page.ev(`document.querySelector('${field}').focus()`);
  await page.fill(field, `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}`);
  await page.key("Tab");
  await sleep(150);
}
const periodRow = (page, p) => page.ev(`document.querySelector('[data-pay-period="${p.from}:${p.to}"]')?.innerText.replace(/\\s+/g, ' ') ?? null`);

try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 950 });

  section("Settings: a custom schedule");
  await admin.go("/settings", 4000);
  await admin.fill('select[name="pay_period"]', "custom");
  await admin.click("button[type=submit]", "Save pay rules");
  check("“Custom schedule” is a pay period to choose", Boolean(await until(() => sql("select value->>'pay_period' from public.app_settings where key = 'time_tracking'") === "custom")));
  check("the Pay Periods list starts empty, saying how", /No pay periods yet/.test(await admin.ev(`document.querySelector('[data-pay-schedule]').innerText`)));

  section("Adding the periods");
  await admin.click("[data-add-pay-period]");
  await until(() => admin.ev(`!!document.querySelector('[data-pay-period-form]')`));
  await setDate(admin, "First day", FIRST.from);
  await setDate(admin, "Last day", FIRST.to);
  await setDate(admin, "Pay date", FIRST.pay);
  await admin.fill('[data-pay-period-form] input[name="optional_dates"]', md(OPTIONAL));
  await admin.fill('[data-pay-period-form] input[name="optional_label"]', "Columbus Day");
  await admin.click("[data-pay-period-form] button[type=submit]");
  await admin.waitToast(/Pay period added/);
  const first = await until(() => periodRow(admin, FIRST));
  check("a period is added: its days, its pay date, the optional day, its work days",
    Boolean(first) && first.includes(`${md(FIRST.from)} – ${md(FIRST.to)}`) && first.includes(`${md(FIRST.pay)}/`) && /Optional – Columbus Day/.test(first)
    && first.trim().endsWith(String(weekdays(FIRST.from, FIRST.to))), first);
  check("…marked as today's", /now/i.test(first ?? ""));

  await admin.click("[data-add-pay-period]");
  await until(() => admin.ev(`!!document.querySelector('[data-pay-period-form]')`));
  const prefilled = await admin.ev(`({ from: document.querySelector('[data-pay-period-form] input[name="starts_on"]').value, to: document.querySelector('[data-pay-period-form] input[name="ends_on"]').value })`);
  check("the next starts the day after the last, two weeks long", prefilled.from === SECOND.from && prefilled.to === add(SECOND.from, 13), JSON.stringify(prefilled));
  await setDate(admin, "Last day", SECOND.to);
  await setDate(admin, "Pay date", SECOND.pay);
  await admin.click("[data-pay-period-form] button[type=submit]");
  await admin.waitToast(/Pay period added/);
  check("…and is added", Boolean(await until(() => periodRow(admin, SECOND))));

  await admin.click("[data-add-pay-period]");
  await until(() => admin.ev(`!!document.querySelector('[data-pay-period-form]')`));
  await admin.fill('[data-pay-period-form] input[name="starts_on"]', add(SECOND.to, -2));
  await admin.fill('[data-pay-period-form] input[name="ends_on"]', add(SECOND.to, 10));
  await admin.click("[data-pay-period-form] button[type=submit]");
  const refused = await until(() => admin.ev(`[...document.querySelectorAll('[data-pay-period-form] [role=alert]')].map((a) => a.textContent).join(' ') || null`));
  check("one that overlaps another is refused, saying so", /Overlaps another pay period/.test(refused ?? ""), refused);
  await admin.key("Escape");
  await until(() => admin.ev(`!document.querySelector('[role=dialog]')`));

  section("Changing one");
  await admin.pointer(`[data-pay-period="${FIRST.from}:${FIRST.to}"] button[aria-label^="Actions"]`);
  await sleep(300);
  check("each period has Edit in its row's menu", await admin.menuItem("Edit"));
  await until(() => admin.ev(`!!document.querySelector('[data-pay-period-form] input[name="closed_dates"]')`));
  await admin.fill('[data-pay-period-form] input[name="closed_dates"]', md(CLOSED));
  await admin.fill('[data-pay-period-form] input[name="closed_label"]', "Office move");
  await admin.click("[data-pay-period-form] button[type=submit]");
  await admin.waitToast(/Pay period updated/);
  const edited = await until(async () => { const r = await periodRow(admin, FIRST); return /Closed – Office move/.test(r ?? "") ? r : null; });
  check("a closed day is shown, and is not a work day", Boolean(edited) && edited.trim().endsWith(String(weekdays(FIRST.from, FIRST.to, [CLOSED]))), edited);
  const year = await admin.ev(`[...document.querySelectorAll('[data-year-work-days]')].map((e) => Number(e.textContent))`);
  check("each year adds up its work days", year.reduce((a, b) => a + b, 0) === weekdays(FIRST.from, FIRST.to, [CLOSED]) + weekdays(SECOND.from, SECOND.to), JSON.stringify(year));

  section("An account manager on Pay & Hours");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 950 });
  await sean.go("/reports/pay", 4000);
  const sub = await sean.ev(`document.querySelector('header')?.innerText ?? ''`);
  check("this pay period is the schedule's, with its pay date", sub.includes("This pay period") && sub.includes("paid"), sub);
  const schedule = await sean.ev(`document.querySelector('[data-pay-schedule]')?.innerText ?? null`);
  check("the year's pay periods are there for the manager to see", Boolean(schedule) && /Office move/.test(schedule) && /Columbus Day/.test(schedule), schedule?.slice(0, 200));
  await sean.click(`[data-pay-period="${SECOND.from}:${SECOND.to}"] a`);
  check("a period opens its pay", Boolean(await until(async () => (await sean.ev(`document.querySelector('header')?.innerText ?? ''`)).includes("Pay period ·"))),
    await sean.ev(`document.querySelector('header')?.innerText ?? ''`));
} finally {
  browser.close();
  clean();
  if (before) sql(`update public.app_settings set value = ${lit(before)}::jsonb where key = 'time_tracking'`);
  else sql("delete from public.app_settings where key = 'time_tracking'");
}

finish("pay periods");
