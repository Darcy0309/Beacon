/**
 * A dropdown's open list scrolls with the mouse wheel inside a dialog (Nov 2026: "Calls through the day",
 * its long list of people, only scrolled by dragging the scrollbar). Chrome draws the styled list outside
 * the page, and the dialog's scroll lock cancelled the wheel there. A long list, opened in a dialog,
 * wheeled: it scrolls; and the page behind the dialog still doesn't.
 *
 *   node tests/run.mjs tests/e2e/dialog-select-wheel.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const LEAD = Number(sql(`select id from public.leads where deleted_at is null order by id limit 1`));
const browser = await launchBrowser({ mouse: true });
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 900 });
  await admin.go(`/leads/${LEAD}`, 8000);
  const styled = await admin.ev(`CSS.supports('appearance', 'base-select')`);
  if (!styled) {
    console.log("Skipped: this Chrome draws the system's own list (no appearance: base-select), which the lock never touched.");
    process.exit(0);
  }

  section("A long list in a dialog, opened and wheeled");
  await until(() => admin.ev(`!!document.querySelector('[data-transfer-open], button')`), { timeout: 15000 });
  const opened = await admin.click("button", "Transfer");
  check("a dialog opened", opened && Boolean(await until(() => admin.ev(`!!document.querySelector('[data-dialog-content]')`), { timeout: 8000 })));
  // Forty names, as the dashboard's chart lists people: more than the list shows at once.
  await admin.ev(`(() => {
    const s = document.createElement('select');
    s.setAttribute('data-long-list', '');
    s.className = 'h-8 rounded-md border px-2 text-sm';
    for (let i = 0; i < 40; i++) { const o = document.createElement('option'); o.value = String(i); o.textContent = 'Person ' + (i + 1); s.append(o); }
    document.querySelector('[data-dialog-content]').prepend(s);
  })()`);
  await admin.mouseClick("[data-long-list]");
  check("the list is open", Boolean(await until(() => admin.ev(`document.querySelector('[data-long-list]').matches(':open')`), { timeout: 5000 })));
  await sleep(300);
  const topOf = () => admin.ev(`Math.round(document.querySelector('[data-long-list] option[value="0"]').getBoundingClientRect().top)`);
  const at = await admin.ev(`(() => { const r = document.querySelector('[data-long-list] option[value="3"]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const before = await topOf();
  const pageBefore = await admin.ev(`document.scrollingElement.scrollTop`);
  for (let i = 0; i < 3; i++) {
    await admin.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: at.x, y: at.y, deltaX: 0, deltaY: 120 });
    await sleep(150);
  }
  await sleep(400);
  const after = await topOf();
  check("the wheel scrolls the list", after < before - 100, `${before} → ${after}`);
  check("…and the list stays open", await admin.ev(`document.querySelector('[data-long-list]').matches(':open')`));
  check("…the page behind the dialog doesn't move", (await admin.ev(`document.scrollingElement.scrollTop`)) === pageBefore);
} finally {
  browser.close();
}

finish("dialog select wheel");
