/**
 * US holidays on the calendars (Sean, Nov 2026: "show us holiday at calendar"): named in the Calendar's month and week,
 * marked on the dashboard's calendar and named on its day.
 *
 *   node tests/run.mjs tests/e2e/holidays.test.mjs
 */
import { check, finish, until, sleep } from "../support/assert.mjs";
import { launchBrowser } from "../support/browser.mjs";
const browser = await launchBrowser();
try {
  const p = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 900 });
  await p.go("/calendar?view=month&d=2026-11-01", 8000);
  const cell = await until(() => p.ev("document.querySelector('[data-holiday=\"2026-11-26\"]')?.innerText ?? null"), { timeout: 20000 });
  check("Calendar month: Thanksgiving named on the 26th", /Thanksgiving Day/.test(cell ?? ""), cell);
  check("…and Veterans Day on the 11th", /Veterans Day/.test(await p.ev("document.querySelector('[data-holiday=\"2026-11-11\"]')?.innerText ?? ''")));
  await p.go("/calendar?view=week&d=2026-11-26", 8000);
  check("week view: under the day", /Thanksgiving/.test(await until(() => p.ev("document.querySelector('[data-holiday=\"2026-11-26\"]')?.textContent ?? null"), { timeout: 20000 }) ?? ""));
  await p.go("/?cm=2026-11", 8000);
  check("dashboard calendar: Thanksgiving marked", Boolean(await until(() => p.ev("!!document.querySelector('[data-day=\"2026-11-26\"][data-holiday] [data-holiday-mark]')"), { timeout: 20000 })));
  await p.ev("document.querySelector('[data-day=\"2026-11-26\"]').scrollIntoView({ block: 'center' })");
  await p.click('[data-day="2026-11-26"]'); await sleep(600);
  check("…and named on the day", /Thanksgiving/.test(await p.ev("document.querySelector('[data-holiday-day]')?.textContent ?? ''")));
} finally { browser.close(); }
finish("holidays");
