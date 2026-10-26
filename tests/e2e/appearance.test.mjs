/**
 * Appearance (Sean, Oct 2026): from the theme button, a wallpaper behind the
 * workspace and the brightness of each theme, shown at once and kept on the
 * computer: on again before the page draws when it is opened next, and back
 * to the original with one button.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { fileURLToPath } from "node:url";

// A picture to upload: the app's own notification icon.
const PICTURE = fileURLToPath(new URL("../../public/notification-icon.png", import.meta.url));

const SHOTS = process.env.SHOTS;
const browser = await launchBrowser();
const html = (page, what) => page.ev(`document.documentElement.${what}`);
// The wallpaper is drawn on its own layer behind the page (body::before), so it can be blurred alone.
const bodyImage = (page) => page.ev("getComputedStyle(document.body, '::before').backgroundImage");
const openAppearance = async (page) => {
  await page.pointer('button[aria-label="Toggle theme"]');
  await sleep(300);
  await page.menuItem("Appearance");
  return until(() => page.ev("!!document.querySelector('[data-appearance-dialog]')"));
};
const setSlider = (page, value) => page.ev(`(() => { const s = document.querySelector('[data-brightness-slider]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(s, '${value}');
  s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);

try {
  const page = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 950 });
  await page.go("/", 4000);
  await page.ev("localStorage.removeItem('lighthouse.appearance'); true");

  section("Appearance, from the theme button");
  check("the theme button has Appearance", Boolean(await openAppearance(page)));
  check("…with the theme, the wallpapers and a brightness slider",
    (await page.ev("document.querySelectorAll('[data-appearance-dialog] [data-desktop-wallpaper]:not([data-desktop-wallpaper^=live-]):not([data-desktop-wallpaper^=photo-])').length")) === 9
    && (await page.ev("!!document.querySelector('[data-brightness-slider]') && document.querySelectorAll('[data-theme-pick]').length === 3")));

  section("The page shows behind it");
  const veil = () => page.ev("document.querySelector('[data-dialog-veil]')?.dataset.dialogVeil");
  const box = await page.ev("(() => { const r = document.querySelector('[data-appearance-dialog]').getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth }; })()");
  check("clear, not blurred, to begin with", (await veil()) === "0"
    && (await page.ev("getComputedStyle(document.querySelector('[data-dialog-veil]')).backdropFilter")) === "none");
  check("…at the right edge, the page beside it", box.left > box.width / 2 - 50 && box.width - box.right < 60, JSON.stringify(box));
  await page.fill("[data-veil-slider]", "60");
  check("the blur slider dims and blurs it as far as asked", (await veil()) === "0.6"
    && (await page.ev("getComputedStyle(document.querySelector('[data-dialog-veil]')).backdropFilter")).includes("blur"));
  await page.fill("[data-veil-slider]", "0");

  section("A wallpaper, at once");
  await page.click('[data-desktop-wallpaper="nebula"]');
  check("picked: behind the whole workspace", (await html(page, "dataset.wallpaper")) === "nebula" && (await bodyImage(page)).includes("gradient"),
    await bodyImage(page));

  section("A photo behind the workspace");
  check("twelve photos to pick from", (await page.ev("document.querySelectorAll('[data-desktop-wallpaper^=\"photo-\"]').length")) === 12);
  await page.click('[data-desktop-wallpaper="photo-fjord"]');
  check("picked: the photo covers the screen", (await html(page, "dataset.wallpaper")) === "photo-fjord" && (await bodyImage(page)).includes("/wallpapers/fjord.webp"), await bodyImage(page));
  check("…and it is there to load", (await page.ev("fetch('/wallpapers/fjord.webp').then((r) => r.ok && r.headers.get('content-type'))")) === "image/webp");
  const lineColour = () => page.ev("getComputedStyle(document.documentElement).getPropertyValue('--progress-a').trim()");
  check("the loading line takes the photo's colours", (await lineColour()) === "#2da1ed", await lineColour());
  if (SHOTS) await page.screenshot(`${SHOTS}/appearance-photo.png`);
  section("The wallpaper blurred, not the page");
  await page.fill("[data-wallpaper-blur-slider]", "12");
  check("Wallpaper blur: the photo behind the pages blurs", (await page.ev("getComputedStyle(document.body, '::before').filter")) === "blur(12px)"
    && (await page.ev("getComputedStyle(document.querySelector('main, [data-panel]') ?? document.body).filter")) === "none",
    await page.ev("getComputedStyle(document.body, '::before').filter"));
  if (SHOTS) await page.screenshot(`${SHOTS}/appearance-photo-blurred.png`);
  await page.fill("[data-veil-slider]", "100");
  check("Blur behind this window goes well past a hint (12 px at the top)", (await page.ev("getComputedStyle(document.querySelector('[data-dialog-veil]')).backdropFilter")) === "blur(12px)",
    await page.ev("getComputedStyle(document.querySelector('[data-dialog-veil]')).backdropFilter"));
  await page.fill("[data-veil-slider]", "0");
  await page.fill("[data-wallpaper-blur-slider]", "0");
  await page.click('[data-desktop-wallpaper="nebula"]');

  section("Brightness, for the theme on show");
  await page.click('[data-theme-pick="dark"]');
  await until(async () => (await html(page, "className")).includes("dark"));
  await setSlider(page, 115);
  check("dark lifted to 115%", (await page.ev("document.querySelector('[data-brightness-value]').textContent")) === "115%"
    && (await page.ev("getComputedStyle(document.documentElement).getPropertyValue('--lift-dark').trim()")) === "0.15"
    && (await page.ev("getComputedStyle(document.querySelector('.brightness-veil')).display")) === "block");
  if (SHOTS) await page.screenshot(`${SHOTS}/appearance-dark.png`);
  await page.click('[data-theme-pick="light"]');
  await until(async () => !(await html(page, "className")).includes("dark"));
  await setSlider(page, 88);
  check("light dimmed to 88%, each theme its own", (await page.ev("getComputedStyle(document.documentElement).getPropertyValue('--dim-light').trim()")) === "0.12"
    && (await page.ev("getComputedStyle(document.documentElement).getPropertyValue('--lift-dark').trim()")) === "0.15");
  if (SHOTS) await page.screenshot(`${SHOTS}/appearance-light.png`);
  await page.click("[data-appearance-dialog] button", "Done");

  section("Kept for next time, on before the page draws");
  await page.go("/work", 3000);
  check("the wallpaper and brightness come back with the page", (await html(page, "dataset.wallpaper")) === "nebula"
    && (await html(page, "hasAttribute('data-brightness')")) && (await bodyImage(page)).includes("gradient"));
  if (SHOTS) await page.screenshot(`${SHOTS}/appearance-workspace.png`);

  section("Live wallpapers, drawn behind the workspace");
  await openAppearance(page);
  check("four to pick from", (await page.ev("document.querySelectorAll('[data-desktop-wallpaper^=\"live-\"]').length")) === 4);
  await page.click('[data-desktop-wallpaper="live-waves"]');
  check("Waves: drawn on its canvas, in place of the snow", Boolean(await until(() => page.ev(`!!document.querySelector('canvas[data-live-wallpaper="live-waves"]')`)))
    && (await html(page, "dataset.wallpaper")) === "live-waves");
  await page.click("[data-appearance-dialog] button", "Done");
  await sleep(600);
  if (SHOTS) await page.screenshot(`${SHOTS}/appearance-live.png`);

  section("A picture of their own");
  await openAppearance(page);
  const { root } = await page.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-wallpaper-file]" });
  await page.send("DOM.setFileInputFiles", { nodeId, files: [PICTURE] });
  check("uploaded: it is the wallpaper", Boolean(await until(() => page.ev("document.documentElement.dataset.wallpaper === 'custom'"), { timeout: 8000 }))
    && (await bodyImage(page)).includes("data:image/jpeg"));
  const tint = await page.ev("localStorage.getItem('lighthouse.appearance.tint')");
  check("…the loading line in the picture's own colours (or the theme's, for a picture with little colour)",
    tint === null || tint === "null" ? !(await page.ev("document.documentElement.style.getPropertyValue('--progress-a')"))
      : JSON.parse(tint)[0] === (await page.ev("document.documentElement.style.getPropertyValue('--progress-a')")), tint);
  check("…kept on the computer, with a swatch to pick it again", Boolean(await page.ev("(localStorage.getItem('lighthouse.appearance.image') ?? '').startsWith('data:image/jpeg')"))
    && Boolean(await page.ev("!!document.querySelector('[data-desktop-wallpaper=\"custom\"]')")));
  await page.click("[data-appearance-dialog] button", "Done");
  await page.go("/work", 3000);
  check("…and on again when a page opens", (await html(page, "dataset.wallpaper")) === "custom" && (await bodyImage(page)).includes("data:image/jpeg"));
  await openAppearance(page);
  await page.click("[data-remove-wallpaper]");
  check("Remove takes it away, its colours too", !(await page.ev("localStorage.getItem('lighthouse.appearance.image')")) && (await html(page, "dataset.wallpaper")) !== "custom"
    && !(await page.ev("localStorage.getItem('lighthouse.appearance.tint')")) && !(await page.ev("document.documentElement.style.getPropertyValue('--progress-a')")));

  section("Back to the original");
  await openAppearance(page);
  await page.click("[data-appearance-reset]");
  check("no wallpaper, no brightness change", !(await html(page, "dataset.wallpaper")) && !(await html(page, "hasAttribute('data-brightness')"))
    && (await page.ev("getComputedStyle(document.querySelector('.brightness-veil')).display")) === "none");
  await page.click('[data-theme-pick="dark"]');

  section("Executive, the default style, and the colours (Sean, Oct 2026)");
  {
    const fresh = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 950 });
    await fresh.go("/", 4000);
    await fresh.ev("localStorage.removeItem('lighthouse.appearance'); true");
    await fresh.go("/projects", 5000);
    const look = () => fresh.ev(`(() => { const d = document.documentElement, cs = getComputedStyle(d);
      return { style: d.dataset.style, executive: 'executive' in d.dataset, tone: d.dataset.tone ?? null, bg: cs.getPropertyValue('--background').trim(),
        title: getComputedStyle(document.querySelector('[data-topbar-title]')).fontFamily }; })()`);
    const first = await look();
    check("nothing chosen: Executive, with its serif titles", first.executive && first.style === "modern" && /Fraunces|display/i.test(first.title), JSON.stringify(first));
    // Someone who had saved Modern back when it was the default moves to Executive, once.
    await fresh.ev(`localStorage.setItem('lighthouse.appearance', JSON.stringify({ style: 'modern', wallpaper: 'classic' })); true`);
    await fresh.go("/projects", 4000);
    check("Modern saved before it stopped being the default: Executive now", (await look()).executive);

    await openAppearance(fresh);
    check("the styles: Executive, Modern and Classic", (await fresh.ev("[...document.querySelectorAll('[data-style-pick]')].map((b) => b.dataset.stylePick).join()")) === "executive,modern,classic"
      && (await fresh.ev("document.querySelector('[data-style-pick=executive]').getAttribute('aria-checked')")) === "true");
    check("twelve colours, a Default and a Custom", (await fresh.ev("document.querySelectorAll('[data-tone-pick]').length")) === 14);
    await fresh.click("[data-tone-pick=sage]");
    const sage = await until(async () => { const l = await look(); return l.tone === "sage" ? l : null; });
    check("Sage: the page, a deeper menu and a green accent, at once", Boolean(sage)
      // Its deep green on a light page; in the dark theme the page stays dark and the accent is the lighter green.
      && (await fresh.ev("getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()")) === ((await fresh.ev("document.documentElement.classList.contains('dark')")) ? "#9cc9a2" : "#3f6b45"),
      JSON.stringify(sage));
    await fresh.ev(`(() => { const i = document.querySelector('[data-tone-color]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '#8a2be2');
      i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    check("a colour of their own: worked into a page, menu and accent", Boolean(await until(async () => (await look()).tone === "custom"))
      && /^#[0-9a-f]{6}$/.test(await fresh.ev("document.documentElement.style.getPropertyValue('--tone-menu')")));
    await fresh.click("[data-style-pick=modern]");
    check("Modern chosen: Executive off", !(await until(async () => !(await look()).executive ? true : null) === null));
    await fresh.key("Escape");
    await fresh.go("/projects", 4000);
    const kept = await look();
    check("kept after a reload, before the page draws: Modern, their own colour", !kept.executive && kept.tone === "custom", JSON.stringify(kept));
    await fresh.ev("localStorage.removeItem('lighthouse.appearance'); true");
  }
} finally {
  browser.close();
}

finish("appearance");
