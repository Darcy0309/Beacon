/**
 * The gem cursor (Oct 2026: the whole app, to the client's design): with a
 * mouse, the pointer is a gold-framed arrowhead of teal crystal with a large
 * emerald set in it like a button; over what can be clicked, electric
 * current crackles round the gem; a click presses it in and sends rings out; the computer's own cursor comes back in a text
 * box and over what is switched off. Without a mouse (a touch screen) nothing
 * changes. Appearance turns it off (Standard), kept on this computer.
 *
 *   node tests/e2e/cursor.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { launchBrowser } from "../support/browser.mjs";

const browser = await launchBrowser({ mouse: true });
const touch = await launchBrowser();
try {
  const page = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 950 });
  await page.go("/", 6000);
  await page.ev("localStorage.removeItem('lighthouse.appearance'); true");
  await page.go("/", 5000);
  const state = () => page.ev(`(() => { const g = document.querySelector('.gem-cursor');
    return { live: document.documentElement.hasAttribute('data-cursor-live'), dot: g?.dataset.hidden, hover: g?.dataset.hover, press: g?.dataset.press,
      body: getComputedStyle(document.body).cursor, at: g?.style.transform ?? '',
      bolts: [...(g?.querySelectorAll('.gem-cursor-bolt') ?? [])].map((b) => b.getAttribute('d') ?? ''),
      current: g ? getComputedStyle(g.querySelector('.gem-cursor-electric')).opacity : null }; })()`);

  section("With a mouse");
  check("on to begin with: the computer's own pointer hidden", Boolean(await until(async () => (await state()).live)) && (await state()).body === "none", JSON.stringify(await state()));
  await page.hover({ x: 700, y: 120 });
  // The arrow's tip (3, 2 in its drawing) on the mouse.
  const moved = await until(async () => { const s = await state(); return s.dot === "false" && s.at.includes("697px, 118px") && s; });
  check("the gem arrow is where the mouse is, its tip on it", Boolean(moved), JSON.stringify(await state()));
  check("…a large gem set in the arrow", await page.ev(`(() => { const a = document.querySelector('.gem-cursor-frame').getBBox(), g = document.querySelector('.gem-cursor-gem').getBBox();
    return g.width >= 12 && g.x > a.x && g.x + g.width < a.x + a.width && g.y > a.y && g.y + g.height < a.y + a.height; })()`));
  check("…no current while over nothing to click", (await state()).hover === "false" && (await state()).bolts.every((d) => !d));
  await page.hover("a[href], button:not(:disabled)");
  check("over what can be clicked, the current is on", Boolean(await until(async () => { const s = await state(); return s.hover === "true" && Number(s.current) > 0.5 && s.bolts.every((d) => d.startsWith("M")); })),
    JSON.stringify(await state()));
  const first = (await state()).bolts.join("|");
  check("…and crackles: the bolts keep changing", Boolean(await until(async () => (await state()).bolts.join("|") !== first, { timeout: 2000 })));
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 700, y: 120, button: "left", clickCount: 1 });
  check("…a press pushes the gem in", Boolean(await until(async () => (await state()).press === "true")));
  check("…and sends rings out from it", (await page.ev("document.querySelectorAll('.gem-cursor-ripple.gem-cursor-ripple-go').length")) === 2);
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 700, y: 120, button: "left", clickCount: 1 });
  await page.hover('input[type="text"], input[type="search"], input:not([type])');
  const field = await until(async () => { const s = await state(); return s.dot === "true" && s; });
  check("in a text box, the computer's own text cursor instead", Boolean(field)
    && (await page.ev(`getComputedStyle(document.querySelector('input[type="text"], input[type="search"], input:not([type])')).cursor`)) === "text", JSON.stringify(await state()));

  section("Standard, from Appearance");
  await page.pointer('button[aria-label="Toggle theme"]');
  await sleep(300);
  await page.menuItem("Appearance");
  await until(() => page.ev("!!document.querySelector('[data-cursor-pick]')"));
  check("Appearance offers the cursor, the gem arrow to begin with", (await page.ev(`document.querySelector('[data-cursor-pick="gem"]')?.getAttribute('aria-checked')`)) === "true");
  await page.click('[data-cursor-pick="standard"]');
  check("Standard: the computer's own pointer back at once", Boolean(await until(async () => !(await state()).live && (await state()).body !== "none")), JSON.stringify(await state()));
  await page.go("/", 5000);
  check("…and kept for next time", Boolean(await until(async () => (await page.ev("document.documentElement.dataset.cursor")) === "standard" && !(await state()).live)));
  await page.ev("localStorage.removeItem('lighthouse.appearance'); true");

  section("A touch screen");
  const tablet = await (await touch.newContext({ as: "sean@beacon.test" })).newPage({ width: 1024, height: 900 });
  await tablet.go("/", 6000);
  await sleep(500);
  check("without a mouse, nothing changes", !(await tablet.ev("document.documentElement.hasAttribute('data-cursor-live')"))
    && (await tablet.ev("getComputedStyle(document.body).cursor")) !== "none");
} finally {
  browser.close();
  touch.close();
}

finish("cursor");
