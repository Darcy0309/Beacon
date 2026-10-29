/**
 * The gem cursor (Oct 2026: the whole app, to the client's design): with a
 * mouse, the pointer (the computer's own, as an image, so it moves as fast as
 * the system's) is a gold-framed arrowhead of teal crystal with a large
 * emerald set in it like a button; over what can be clicked, electric
 * current crackles round the gem; a click presses it in and sends rings
 * out; the computer's own cursor comes back in a text box and over what is
 * switched off. Without a mouse (a touch screen) nothing
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
    return { live: document.documentElement.hasAttribute('data-cursor-live'), dot: g?.dataset.hidden, hover: g?.dataset.hover,
      body: getComputedStyle(document.body).cursor, at: g?.style.transform ?? '',
      bolts: [...(g?.querySelectorAll('.gem-cursor-bolt') ?? [])].map((b) => b.getAttribute('d') ?? ''),
      current: g ? getComputedStyle(g.querySelector('.gem-cursor-electric')).opacity : null }; })()`);

  section("With a mouse");
  // Oct 2026: the gem is the computer's own cursor, as an image, so it moves as fast as the system's pointer.
  const isGem = (c) => /^url\("data:image\/svg\+xml,/.test(c ?? "") && /2fe0b0/i.test(decodeURIComponent(c));
  check("on to begin with: the gem as the computer's own cursor", Boolean(await until(async () => (await state()).live)) && isGem((await state()).body), (await state()).body.slice(0, 60));
  check("…its tip the point that clicks", /"\) 3 2, auto$/.test((await state()).body), (await state()).body.slice(-20));
  await page.hover({ x: 700, y: 120 });
  // The effects drawn over it sit on it: the drawing's tip (3, 2) on the mouse.
  const moved = await until(async () => { const s = await state(); return s.dot === "false" && s.at.includes("697px, 118px") && s; });
  check("the effects drawn over it follow it, on its tip", Boolean(moved), JSON.stringify(await state()));
  check("…a large emerald in a gold bezel, set in a gold-framed crystal arrow", await page.ev(`(() => { const c = decodeURIComponent(getComputedStyle(document.body).cursor);
    return c.includes('<circle cx="16.5" cy="24.5" r="8.2" fill="url(#g)"') && c.includes('stroke="url(#g)"') && c.includes('fill="url(#c)"'); })()`));
  check("…no current while over nothing to click", (await state()).hover === "false" && (await state()).bolts.every((d) => !d));
  await page.hover("a[href], button:not(:disabled)");
  const linkCursor = await page.ev(`getComputedStyle(document.querySelector('a[href], button:not(:disabled)')).cursor`);
  check("over what can be clicked, the larger glowing gem", isGem(linkCursor) && linkCursor !== (await state()).body && /feFlood/.test(decodeURIComponent(linkCursor)), linkCursor.slice(0, 60));
  check("…and the current is on round it", Boolean(await until(async () => { const s = await state(); return s.hover === "true" && Number(s.current) > 0.5 && s.bolts.every((d) => d.startsWith("M")); })),
    JSON.stringify(await state()));
  // The system draws its cursor over everything, this too: the current has to be outside the arrow to be seen (Oct 2026).
  const outside = await page.ev(`(() => {
    const poly = [[3, 2], [38, 31], [26, 31], [32, 47], [21, 36], [12, 45]];
    const inside = ([x, y]) => poly.reduce((c, [x1, y1], i) => { const [x2, y2] = poly[(i + 1) % poly.length];
      return ((y1 > y) !== (y2 > y)) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1 ? !c : c; }, false);
    const pts = [...document.querySelectorAll('.gem-cursor-bolt, .gem-cursor-tendril, .gem-cursor-arc')]
      .flatMap((p) => [...(p.getAttribute('d') ?? '').matchAll(/(-?[\\d.]+) (-?[\\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]));
    return pts.length ? pts.filter((q) => !inside(q)).length / pts.length : 0; })()`);
  check("…drawn outside the arrow, where the cursor doesn't cover it", outside > 0.9, outside);
  const first = (await state()).bolts.join("|");
  check("…and crackles: the bolts keep changing", Boolean(await until(async () => (await state()).bolts.join("|") !== first, { timeout: 2000 })));
  const there = await page.ev(`(() => { const r = document.querySelector('a[href], button:not(:disabled)').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: there.x, y: there.y, button: "left", clickCount: 1 });
  const pressed = await page.ev(`getComputedStyle(document.querySelector('a[href]:active, button:active') ?? document.body).cursor`);
  check("…a press pushes the gem in", isGem(pressed) && pressed !== linkCursor, pressed.slice(0, 40));
  check("…and sends rings out from it", (await page.ev("document.querySelectorAll('.gem-cursor-ripple.gem-cursor-ripple-go').length")) === 2);
  // Let go off the link, so nothing opens.
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 400, button: "left", buttons: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 700, y: 400, button: "left", clickCount: 1 });
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
  check("Standard: the computer's own pointer back at once", Boolean(await until(async () => !(await state()).live && !isGem((await state()).body))), JSON.stringify(await state()));
  await page.go("/", 5000);
  check("…and kept for next time", Boolean(await until(async () => (await page.ev("document.documentElement.dataset.cursor")) === "standard" && !(await state()).live)));
  await page.ev("localStorage.removeItem('lighthouse.appearance'); true");

  section("A touch screen");
  const tablet = await (await touch.newContext({ as: "sean@beacon.test" })).newPage({ width: 1024, height: 900 });
  await tablet.go("/", 6000);
  await sleep(500);
  check("without a mouse, nothing changes", !(await tablet.ev("document.documentElement.hasAttribute('data-cursor-live')"))
    && (await tablet.ev("getComputedStyle(document.body).cursor")) === "auto");
} finally {
  browser.close();
  touch.close();
}

finish("cursor");
