/**
 * Cursor styles (Oct 2026: the client's sheet of twenty, chosen in
 * Appearance; the computer's own cursor unless someone picks one). A chosen
 * style is the computer's own cursor, as an image, so it moves as fast as the
 * system's pointer: larger over what can be clicked, a ring when pressed. The
 * Electric Gem's current, and a style's hearts or stars, are drawn on the
 * page outside it (the system draws its cursor over everything). The usual
 * cursor in a text box; a size to choose; nothing without a mouse.
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
  const state = () => page.ev(`(() => { const g = document.querySelector('.cursor-effects');
    return { live: document.documentElement.hasAttribute('data-cursor-live'), style: document.documentElement.dataset.cursor, hidden: g?.dataset.hidden, hover: g?.dataset.hover,
      body: getComputedStyle(document.body).cursor, at: g?.style.transform ?? '', hot: g ? getComputedStyle(g).getPropertyValue('--cursor-hot').trim() : '',
      bolts: [...(g?.querySelectorAll('.cursor-bolt') ?? [])].map((b) => b.getAttribute('d') ?? ''),
      current: g?.querySelector('.cursor-electric') ? getComputedStyle(g.querySelector('.cursor-electric')).opacity : null }; })()`);
  const isImage = (c) => /^url\("data:image\/svg\+xml,/.test(c ?? "");
  const tall = (c) => Number(/height%3D%22(\d+)%22/.exec(c ?? "")?.[1] ?? 0);
  const openAppearance = async () => {
    await page.pointer('button[aria-label="Toggle theme"]');
    await sleep(300);
    await page.menuItem("Appearance");
    return until(() => page.ev("!!document.querySelector('[data-cursor-pick]')"));
  };
  const closeAppearance = () => page.key("Escape");

  section("The computer's own, to begin with");
  check("no style chosen: the computer's own cursor", !(await state()).live && (await state()).body === "auto" && (await state()).style === "standard", JSON.stringify(await state()));
  await openAppearance();
  const tiles = await page.ev("[...document.querySelectorAll('[data-cursor-pick]')].map((b) => b.dataset.cursorPick)");
  check("Appearance offers twenty cursors, System default first and chosen", tiles.length === 20 && tiles[0] === "standard"
    && (await page.ev(`document.querySelector('[data-cursor-pick="standard"]').getAttribute('aria-checked')`)) === "true", tiles.join(","));
  check("…each shown as it looks", (await page.ev("[...document.querySelectorAll('[data-cursor-pick] img')].filter((i) => i.complete && i.naturalWidth > 0).length")) === 19);

  section("The Electric Gem, chosen");
  await page.click('[data-cursor-pick="electric-gem"]');
  check("chosen: the computer's own cursor becomes its image", Boolean(await until(async () => (await state()).live)) && isImage((await state()).body), (await state()).body.slice(0, 50));
  check("…about the size of a computer's own cursor", tall((await state()).body) <= 40 && tall((await state()).body) >= 30, tall((await state()).body));
  await closeAppearance();
  await sleep(300);
  await page.hover({ x: 700, y: 120 });
  const moved = await until(async () => { const s = await state(); const [hx, hy] = s.hot.split(" ").map((v) => parseInt(v, 10));
    return s.hidden === "false" && s.at.includes(`${700 - hx}px, ${120 - hy}px`) && s; });
  check("the effects drawn over it follow it, on its tip", Boolean(moved), JSON.stringify(await state()));
  check("…a large emerald in a gold bezel, in a gold-framed crystal arrow", await page.ev(`(() => { const c = decodeURIComponent(getComputedStyle(document.body).cursor);
    return c.includes('<circle cx="16.5" cy="24.5" r="8.2" fill="url(#g)"') && c.includes('stroke="url(#g)"') && c.includes('fill="url(#c)"'); })()`));
  check("…no current while over nothing to click", (await state()).hover === "false" && (await state()).bolts.every((d) => !d));
  await page.hover("a[href], button:not(:disabled)");
  const linkCursor = await page.ev(`getComputedStyle(document.querySelector('a[href], button:not(:disabled)')).cursor`);
  check("over what can be clicked, larger and glowing", isImage(linkCursor) && tall(linkCursor) > tall((await state()).body) && /feFlood/.test(decodeURIComponent(linkCursor)));
  check("…and the current is on round it", Boolean(await until(async () => { const s = await state(); return s.hover === "true" && Number(s.current) > 0.5 && s.bolts.every((d) => d.startsWith("M")); })),
    JSON.stringify(await state()));
  // The system draws its cursor over everything, this too: the current has to be outside the arrow to be seen.
  const outside = await page.ev(`(() => {
    const poly = [[3, 2], [38, 31], [26, 31], [32, 47], [21, 36], [12, 45]];
    const inside = ([x, y]) => poly.reduce((c, [x1, y1], i) => { const [x2, y2] = poly[(i + 1) % poly.length];
      return ((y1 > y) !== (y2 > y)) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1 ? !c : c; }, false);
    const pts = [...document.querySelectorAll('.cursor-bolt, .cursor-tendril, .cursor-arc')]
      .flatMap((p) => [...(p.getAttribute('d') ?? '').matchAll(/(-?[\\d.]+) (-?[\\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]));
    return pts.length ? pts.filter((q) => !inside(q)).length / pts.length : 0; })()`);
  check("…drawn outside the arrow, where the cursor doesn't cover it", outside > 0.9, outside);
  const first = (await state()).bolts.join("|");
  check("…and crackles: the bolts keep changing", Boolean(await until(async () => (await state()).bolts.join("|") !== first, { timeout: 2000 })));
  const there = await page.ev(`(() => { const r = document.querySelector('a[href], button:not(:disabled)').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: there.x, y: there.y, button: "left", clickCount: 1 });
  const pressed = await page.ev(`getComputedStyle(document.querySelector('a[href]:active, button:active') ?? document.body).cursor`);
  check("a press: a ring round it", isImage(pressed) && pressed !== linkCursor && /stroke-width%3D%221.4%22/.test(pressed), pressed.slice(0, 40));
  check("…and rings sent out", (await page.ev("document.querySelectorAll('.cursor-ripple.cursor-ripple-go').length")) === 2);
  // Let go off the link, so nothing opens.
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 400, button: "left", buttons: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 700, y: 400, button: "left", clickCount: 1 });
  await page.hover('input[type="text"], input[type="search"], input:not([type])');
  const field = await until(async () => { const s = await state(); return s.hidden === "true" && s; });
  check("in a text box, the computer's own text cursor instead", Boolean(field)
    && (await page.ev(`getComputedStyle(document.querySelector('input[type="text"], input[type="search"], input:not([type])')).cursor`)) === "text", JSON.stringify(await state()));

  section("Another style, and a size");
  await openAppearance();
  await page.click('[data-cursor-pick="heart"]');
  await until(async () => (await state()).style === "heart");
  const normal = tall((await state()).body);
  await page.click('[data-cursor-size-pick="large"]');
  check("Large: the same cursor, larger", Boolean(await until(async () => tall((await state()).body) > normal)), `${normal} → ${tall((await state()).body)}`);
  await page.click('[data-cursor-size-pick="small"]');
  check("…Small, smaller", Boolean(await until(async () => tall((await state()).body) < normal)), `${normal} → ${tall((await state()).body)}`);
  await closeAppearance();
  await sleep(300);
  await page.hover({ x: 700, y: 400 });
  await page.hover("a[href], button:not(:disabled)");
  check("Heart: hearts round it over something to click", Boolean(await until(() => page.ev(`(() => { const g = document.querySelector('.cursor-effects [data-effect="hearts"]');
    return Boolean(g) && getComputedStyle(g).opacity === '1' && [...g.querySelectorAll('.cursor-bit')].some((b) => Number(b.style.opacity) > 0); })()`))));
  await page.go("/", 5000);
  check("…kept for next time, with its size", Boolean(await until(async () => (await state()).style === "heart" && (await state()).live
    && (await page.ev("document.documentElement.dataset.cursorSize")) === "small")));

  section("Back to the computer's own");
  await openAppearance();
  await page.click('[data-cursor-pick="standard"]');
  check("System default: the computer's own pointer back at once", Boolean(await until(async () => !(await state()).live && (await state()).body === "auto")), JSON.stringify(await state()));
  check("…the size not offered without a style", await page.ev(`document.querySelector('[data-cursor-size-pick="normal"]').disabled`));
  await page.ev("localStorage.removeItem('lighthouse.appearance'); true");

  section("A touch screen");
  const tablet = await (await touch.newContext({ as: "sean@beacon.test" })).newPage({ width: 1024, height: 900 });
  await tablet.go("/", 6000);
  await tablet.ev(`localStorage.setItem('lighthouse.appearance', JSON.stringify({ cursor: 'heart' })); true`);
  await tablet.go("/", 5000);
  check("without a mouse, nothing changes, even with a style chosen", !(await tablet.ev("document.documentElement.hasAttribute('data-cursor-live')"))
    && (await tablet.ev("getComputedStyle(document.body).cursor")) === "auto");
  await tablet.ev("localStorage.removeItem('lighthouse.appearance'); true");
} finally {
  browser.close();
  touch.close();
}

finish("cursor");
