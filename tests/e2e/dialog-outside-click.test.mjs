/**
 * A form being filled in stays open when the pointer slips outside it (Sean, Nov 2026: a New project sheet
 * half filled in went with a stray click, and had to be started over). A real mouse click outside the New
 * project sheet leaves it open with what was typed; Cancel, the × and Escape still close it. A window that
 * only shows something (Appearance), with a slider moved, still closes on a click outside.
 *
 *   node tests/run.mjs tests/e2e/dialog-outside-click.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { launchBrowser } from "../support/browser.mjs";

const browser = await launchBrowser({ mouse: true });
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 900 });
  const page = admin;
  const open = () => page.ev("!!document.querySelector('[data-dialog-content]')");
  // A real click on the page behind, in the top-left corner, well away from the window.
  const clickOutside = async () => {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await page.send("Input.dispatchMouseEvent", { type, x: 12, y: 450, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
    }
    await sleep(600);
  };
  const newProject = async () => {
    await page.click("button", "New project");
    return until(() => page.ev("!!document.querySelector('[data-dialog-content] input[name=\"name\"]')"), { timeout: 10000 });
  };

  await page.go("/projects", 6000);

  section("New project: a click outside leaves it open");
  check("the sheet opens", Boolean(await newProject()));
  await clickOutside();
  check("a click outside, nothing typed yet: still open", await open());
  await page.fill('[data-dialog-content] input[name="name"]', "Capital Insurance - OK");
  await clickOutside();
  check("typed into, a click outside: still open", await open());
  check("…with what was typed", (await page.ev("document.querySelector('[data-dialog-content] input[name=\"name\"]').value")) === "Capital Insurance - OK");

  section("Its own ways out still close it");
  await page.click("[data-dialog-content] button", "Cancel");
  check("Cancel", Boolean(await until(async () => !(await open()), { timeout: 5000 })));
  await newProject();
  await page.ev(`document.querySelector('[data-dialog-content] button:has(> .sr-only)')?.click()`);
  check("the ×", Boolean(await until(async () => !(await open()), { timeout: 5000 })));
  await newProject();
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  check("Escape", Boolean(await until(async () => !(await open()), { timeout: 5000 })));

  section("A window that only shows something still closes on a click outside");
  await page.go("/", 5000);
  await page.pointer('button[aria-label="Toggle theme"]');
  await sleep(300);
  await page.menuItem("Appearance");
  check("Appearance opens", Boolean(await until(() => page.ev("!!document.querySelector('[data-appearance-dialog]')"))));
  // A slider moved is not typing: it still closes.
  await page.ev(`(() => { const s = document.querySelector('[data-brightness-slider]'); if (!s) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(s, String(Number(s.value) || 0));
    s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await clickOutside();
  check("…a click outside closes it", Boolean(await until(async () => !(await page.ev("!!document.querySelector('[data-appearance-dialog]')")), { timeout: 5000 })));
} finally {
  browser.close();
}

finish("dialog outside click");
