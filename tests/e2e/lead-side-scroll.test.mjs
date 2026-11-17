/**
 * The lead sheet's right side on a short screen (Nov 2026): the Call Result was cut off under the project
 * calendar with nothing to say so. While there is more below, "More below" shows (pressed, it scrolls on);
 * at the bottom it goes; on a tall screen, with nothing hidden, it never shows.
 *
 *   node tests/run.mjs tests/e2e/lead-side-scroll.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
// A name on an appointment project the administrator can record a result on: calendar and Call Result both shown.
const LEAD = Number(sql(`select l.id from public.leads l join public.projects p on p.id = l.project_id
  join public.project_types t on t.id = p.project_type_id
  where l.deleted_at is null and p.deleted_at is null and t.code = 'APPT' order by l.id limit 1`));
const more = (page) => page.ev(`!!document.querySelector('[data-side-column] [data-more-below]')`);

const browser = await launchBrowser();
try {
  section("A short screen: more below, said so");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 760 });
  await admin.go(`/leads/${LEAD}`, 8000);
  await until(() => admin.ev(`!!document.querySelector('[data-side-column] [data-call-result], [data-side-column] [data-dialog-content], [data-side-column]')`), { timeout: 15000 });
  const scrolls = await admin.ev(`(() => { const c = document.querySelector('[data-side-column]'); return c.scrollHeight > c.clientHeight + 12; })()`);
  check("the right side scrolls on its own here", scrolls);
  check("…and “More below” shows", Boolean(await until(() => more(admin), { timeout: 5000 })));
  if (SHOTS) await admin.screenshot(`${SHOTS}/lead-more-below.png`);
  await admin.ev(`document.querySelector('[data-side-column] [data-more-below] button').click()`);
  await sleep(800);
  check("pressed, it scrolls on", await admin.ev(`document.querySelector('[data-side-column]').scrollTop > 100`));
  await admin.ev(`(() => { const c = document.querySelector('[data-side-column]'); c.scrollTop = c.scrollHeight; })()`);
  check("at the bottom, it goes", Boolean(await until(async () => !(await more(admin)), { timeout: 5000 })));

  section("A tall screen: nothing hidden, nothing said");
  const tall = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 2400 });
  await tall.go(`/leads/${LEAD}`, 8000);
  await until(() => tall.ev(`!!document.querySelector('[data-side-column]')`), { timeout: 15000 });
  await sleep(1000);
  check("no “More below”", !(await more(tall)));
} finally {
  browser.close();
}

finish("lead side scroll");
