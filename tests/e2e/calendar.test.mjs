/**
 * The calendar module in a real browser: typing dates in words and numbers,
 * picking from the calendar with the mouse and the keyboard, the month and
 * year views, quick picks, the dots for days that already have appointments,
 * the rules (no past dates for an appointment set from a call), staying
 * inside a dialog, and the production report's range picker.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { addDays, addMonths, formatIso, formatRange, monthStart, parseTypedDate, todayIso } from "../../src/lib/dates.js";

const SHOTS = process.env.SHOTS;
const TAG = `CAL-TEST ${Date.now()}`;
const today = todayIso();
const tomorrow = addDays(today, 1);
const busyDay = addDays(monthStart(addMonths(today, 1)), 14); // the 15th of next month

const lead = JSON.parse(sql("select row_to_json(t) from (select id, company_name from public.leads where company_name is not null order by company_name limit 1) t"));
// Two appointments already on the busy day, for the dots.
const [busyA, busyB] = [0, 1].map(() => Number(sql(`insert into public.appointments (lead_id, appt_date, appt_time, rep_name)
  values (${lead.id}, ${lit(busyDay)}, '9:00 AM', ${lit(TAG)}) returning id`)));

const browser = await launchBrowser();
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);
const page = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
const DATE = 'input[aria-label="Appointment date"]';
const hidden = (p, name = "appt_date") => p.ev(`document.querySelector('input[type=hidden][name=${name}]')?.value ?? null`);
const calendarOpen = (p) => p.ev("!!document.querySelector('[aria-label=Calendar] [role=grid]')");
const focused = (p) => p.ev("document.activeElement?.dataset?.iso ?? document.activeElement?.getAttribute('aria-label') ?? ''");
/** Type into the date field the way a person does, then leave it with `key`. */
async function type(p, text, key = "Tab") {
  await p.ev(`document.querySelector('${DATE}').focus()`);
  await p.fill(DATE, text);
  await p.key(key);
  await sleep(150);
}

try {
  section("Typing a date");
  await page.go("/appointments", 4000);
  await page.click("button", "New appointment");
  await until(() => page.ev("!!document.querySelector('[role=combobox]')"));
  check("the field starts on today, in words", (await page.ev(`document.querySelector('${DATE}').value`)) === formatIso(today) && (await hidden(page)) === today,
    await page.ev(`document.querySelector('${DATE}').value`));
  await type(page, "tomorrow", "Enter");
  check(`"tomorrow" is ${tomorrow}`, (await hidden(page)) === tomorrow, await hidden(page));
  check("…shown as a date with how far off it is", (await page.ev(`document.querySelector('${DATE}').value`)) === formatIso(tomorrow)
    && /tomorrow/.test(await page.ev("document.querySelector('[data-relative]')?.textContent ?? ''")));
  const nextFri = parseTypedDate("next fri");
  await type(page, "next fri");
  check(`"next fri" is ${nextFri}`, (await hidden(page)) === nextFri, await hidden(page));
  await type(page, "12/24");
  check('"12/24" is this Christmas Eve or the next one', (await hidden(page)) === parseTypedDate("12/24", { future: true }), await hidden(page));
  await type(page, "soon");
  check("something that is not a date says so", /Couldn't read that date/.test(await page.text()) && (await hidden(page)) === "", await hidden(page));

  section("Picking from the calendar");
  await page.mouseClick('[role=dialog] button[aria-label="Choose a date"]');
  check("the icon opens the calendar", await until(() => calendarOpen(page), { timeout: 3000 }));
  check("…with today's date ready for the keyboard", await until(async () => (await focused(page)) === today, { timeout: 2000 }), await focused(page));
  await page.key("ArrowRight");
  await page.key("ArrowDown");
  check("arrows move a day and a week", (await focused(page)) === addDays(today, 8), await focused(page));
  await page.key("Enter");
  check("Enter picks it and closes the calendar", (await hidden(page)) === addDays(today, 8) && (await until(async () => !(await calendarOpen(page)), { timeout: 2000 })), await hidden(page));
  check("…and the cursor is back in the field", await until(async () => (await page.ev("document.activeElement?.getAttribute('aria-label')")) === "Appointment date", { timeout: 2000 }),
    await page.ev("document.activeElement?.outerHTML.slice(0, 80)"));

  await page.mouseClick(DATE);
  check("clicking into the field opens the calendar too", await until(() => calendarOpen(page), { timeout: 3000 }));
  await page.key("Escape");
  const closed = await until(async () => !(await calendarOpen(page)), { timeout: 3000 });
  await sleep(300);
  const dialogStill = await page.ev("!!document.querySelector('[role=combobox]')");
  check("Escape closes the calendar, not the dialog around it", closed && dialogStill, `calendar closed: ${closed}, dialog open: ${dialogStill}`);

  await page.mouseClick('[role=dialog] button[aria-label^="Change date"]');
  await until(() => calendarOpen(page));
  await page.click('[aria-label=Calendar] button', "Next Monday");
  check("a quick pick sets the day", (await hidden(page)) === parseTypedDate("next mon"), await hidden(page));

  section("Month and year views");
  await page.mouseClick('[role=dialog] button[aria-label^="Change date"]');
  await until(() => calendarOpen(page));
  await page.click('[aria-label=Calendar] button[aria-label$="choose a month"]');
  await page.click('[aria-label=Calendar] button', String(Number(today.slice(0, 4))));
  const nextYear = String(Number(today.slice(0, 4)) + 1);
  await page.click('[aria-label=Calendar] button', nextYear);
  await page.click('[aria-label=Calendar] button', "Mar");
  check(`year, then month: March ${nextYear} in three clicks`, await until(async () => /March/.test(await page.ev("document.querySelector('[aria-label=Calendar] [role=grid]')?.getAttribute('aria-labelledby') && document.getElementById(document.querySelector('[aria-label=Calendar] [role=grid]').getAttribute('aria-labelledby')).textContent")), { timeout: 2000 }));
  await page.click(`[aria-label=Calendar] button[data-iso="${nextYear}-03-17"]`);
  check("…and a click there picks it", (await hidden(page)) === `${nextYear}-03-17`, await hidden(page));

  section("Days that already have appointments");
  await page.mouseClick('[role=dialog] button[aria-label^="Change date"]');
  await until(() => calendarOpen(page));
  await page.click('[aria-label=Calendar] button[aria-label$="choose a month"]');
  // Back to this year if the last pick moved on, then next month.
  if (!(await page.ev(`[...document.querySelectorAll('[aria-label=Calendar] button')].some((b) => b.textContent.trim() === ${JSON.stringify(today.slice(0, 4))})`))) {
    await page.click('[aria-label=Calendar] button[aria-label="Previous year"]');
  }
  await page.click('[aria-label=Calendar] button', formatIso(busyDay, "month").slice(0, 3));
  const busy = () => page.ev(`document.querySelector('[aria-label=Calendar] button[data-iso="${busyDay}"]')?.getAttribute('aria-label') ?? ''`);
  check(`${busyDay} says it already has 2 appointments`, await until(async () => /2 appointments/.test(await busy()), { timeout: 4000 }), await busy());
  check("…with two dots", (await page.ev(`document.querySelector('[aria-label=Calendar] button[data-iso="${busyDay}"] span[aria-hidden]')?.children.length ?? 0`)) === 2);
  await shot(page, "calendar-dots");
  await page.click(`[aria-label=Calendar] button[data-iso="${busyDay}"]`);

  section("Scheduling with it");
  await page.fill("[role=combobox]", lead.company_name);
  await until(() => page.ev(`[...document.querySelectorAll('[role=option]')].length > 0`), { timeout: 5000 });
  await page.ev(`document.querySelector('[role=option]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
  await page.click("button", "Schedule");
  await page.waitToast(/Appointment scheduled/);
  check("the appointment is booked on the picked day", await until(() => Number(sql(`select count(*) from public.appointments where lead_id=${lead.id} and appt_date=${lit(busyDay)}`)) === 3));

  section("An appointment set from a call: today or later");
  const agentLead = sql(`select l.id from public.leads l join public.projects p on p.id=l.project_id join public.project_types t on t.id=p.project_type_id
    join public.users u on u.id=l.assigned_user_id where t.code='APPT' and u.email='mike@beacon.test' order by l.id limit 1`);
  const mike = await (await browser.newContext({ as: "mike@beacon.test" })).newPage();
  await mike.go(`/leads/${agentLead}`, 4500);
  await mike.ev(`[...document.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.trim() === 'Appointment')?.click()`);
  await until(() => mike.ev(`!!document.querySelector('${DATE}')`));
  await mike.mouseClick('button[aria-label="Choose a date"]');
  await until(() => calendarOpen(mike));
  const yesterday = addDays(today, -1);
  const past = await mike.ev(`(() => { const b = document.querySelector('[aria-label=Calendar] button[data-iso="${yesterday}"]'); return b ? b.disabled : 'not shown'; })()`);
  check("yesterday cannot be picked", past === true || past === "not shown", String(past));
  await mike.key("Escape");
  await type(mike, "yesterday");
  check("…nor typed", /today or later/.test(await mike.text()) && (await hidden(mike)) === "", await hidden(mike));
  await shot(mike, "calendar-call-panel");

  section("The production report's range picker");
  /** Wait until the report for a range has loaded (its picker shows the range). */
  const showing = (from, to) => until(async () => (await page.url()).includes(`from=${from}&to=${to}`)
    && (await page.ev(`document.readyState === 'complete' && !!document.querySelector('button[aria-label^="Date range, ${formatRange(from, to)}"]')`)), { timeout: 10000 });
  /**
   * Open the range picker. A freshly loaded report can show its button a
   * moment before React is listening to it, so click until it opens.
   */
  const rangeOpen = (p) => p.ev("!!document.querySelector('[aria-label=\"Choose a date range\"] [role=grid]')");
  const openRange = (p = page) => until(async () => {
    if (await rangeOpen(p)) return true;
    await p.mouseClick('button[aria-label^="Date range"]');
    await sleep(150);
    return rangeOpen(p);
  }, { timeout: 10000, interval: 400 });
  await page.go("/reports/production", 4000);
  check("the range picker opens", await openRange());
  await page.click('[aria-label="Choose a date range"] button', "Last 7 days");
  check("a quick range applies at once", await showing(addDays(today, -6), today), await page.url());
  await openRange();
  const [first, last] = [addDays(today, -20), addDays(today, -10)];
  await page.click(`[aria-label="Choose a date range"] button[data-iso="${last}"]`);
  await page.click(`[aria-label="Choose a date range"] button[data-iso="${first}"]`);
  check("two clicks make a range, in either order", await until(async () => /11 days/.test(await page.text()), { timeout: 2000 }),
    await page.ev(`document.querySelector('[aria-label="Choose a date range"] [aria-live]')?.textContent ?? 'no picker'`));
  await shot(page, "calendar-range");
  await page.click('[aria-label="Choose a date range"] button', "Apply");
  check("Apply shows that range", (await showing(first, last)) && (await page.url()).includes("period=custom"), await page.url());
  // Today's view shows this month, where tomorrow is (unless today is the month's last day).
  await page.go("/reports/production", 4000);
  await openRange();
  const tomorrowButton = await page.ev(`(() => { const b = document.querySelector('[aria-label="Choose a date range"] button[data-iso="${tomorrow}"]'); return b ? (b.disabled ? 'disabled' : 'enabled') : 'not shown'; })()`);
  check("days after today cannot be chosen", tomorrowButton === "disabled" || (tomorrowButton === "not shown" && tomorrow.slice(8) === "01"), tomorrowButton);

  // The calendar in the appointment dialog, on a desktop window like the
  // client's (about 1920 x 870 inside the browser) and on a short laptop
  // screen: never any of it off screen; where it cannot fit, it scrolls.
  section("Always on screen");
  for (const [width, height, fitsWhole] of [[1920, 870, true], [1366, 768, true], [1280, 560, false]]) {
    const p = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width, height });
    await p.go("/appointments", 4000);
    await p.click("button", "New appointment");
    await until(() => p.ev(`!!document.querySelector('${DATE}')`));
    await p.mouseClick('[role=dialog] button[aria-label^="Change date"]');
    await until(() => calendarOpen(p));
    await sleep(400); // past the opening animation
    const box = await p.ev(`(() => { const c = document.querySelector('[aria-label=Calendar]'); const r = c.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), view: innerHeight, scrolls: c.scrollHeight > c.clientHeight + 1 }; })()`);
    const onScreen = box.top >= 0 && box.bottom <= box.view;
    check(`${width}x${height}: the calendar is all on screen${fitsWhole ? ", without scrolling" : " (scrolling inside)"}`,
      onScreen && (fitsWhole ? !box.scrolls : true), JSON.stringify(box));
    if (width === 1920) await shot(p, "calendar-desktop");
  }

  section("On a phone");
  const phone = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 390, height: 844 });
  await phone.go("/reports/production", 4500);
  await openRange(phone);
  const box = await phone.ev(`(() => { const r = document.querySelector('[aria-label="Choose a date range"]').getBoundingClientRect(); return { left: r.left, right: r.right, grids: document.querySelectorAll('[aria-label="Choose a date range"] [role=grid]').length }; })()`);
  check("the range picker fits the screen, one month at a time", box.left >= 0 && box.right <= 390 && box.grids === 1, JSON.stringify(box));
  await shot(phone, "calendar-phone");
} finally {
  sql(`delete from public.notifications where body like ${lit(`%${lead.company_name}%`)} and created_at > now() - interval '15 minutes'`);
  sql(`delete from public.appointments where id in (${busyA}, ${busyB}) or (lead_id = ${lead.id} and appt_date = ${lit(busyDay)} and appt_create_date > now() - interval '15 minutes')`);
  browser.close();
}

finish("calendar");
