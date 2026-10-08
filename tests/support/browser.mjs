/**
 * Headless Chrome over the DevTools protocol, with no dependencies: Node's
 * built-in WebSocket speaks it directly.
 *
 *   const browser = await launchBrowser();
 *   const agent = await browser.newContext({ as: "agent@beacon.test" }); // own cookies
 *   const page = await agent.newPage();
 *   await page.go("/leads");
 *   ...
 *   browser.close();
 *
 * Each context is a separate cookie jar, like a separate browser profile, so
 * two people can be signed in side by side. Pages in one context are tabs.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_URL } from "./env.mjs";
import { sleep, until } from "./assert.mjs";
import { sessionCookies } from "./auth.mjs";

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
    else resolve(msg.result);
  };
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const n = ++id;
        pending.set(n, { resolve, reject });
        ws.send(JSON.stringify({ id: n, method, params }));
      }),
    close: () => ws.close(),
  };
}

const KEYS = { Enter: 13, Escape: 27, Tab: 9 };
const js = (value) => JSON.stringify(value);

async function openPage(browser, port, browserContextId, { width = 1440, height = 950 } = {}) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
  const cdp = await connect(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });

  const ev = async (expression) =>
    (await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;

  const page = {
    send: cdp.send,
    /** Evaluate an expression in the page and return its value. */
    ev,
    /** Navigate to an app path (or full URL) and give the page time to settle. */
    go: async (path, settle = 3500) => {
      await cdp.send("Page.navigate", { url: /^https?:/.test(path) ? path : `${APP_URL}${path}` });
      await sleep(settle);
    },
    path: () => ev("location.pathname"),
    url: () => ev("location.pathname + location.search"),
    text: () => ev("document.body.innerText"),
    /** Make this the visible tab. Background tabs pause animation frames. */
    front: () => cdp.send("Page.bringToFront"),
    screenshot: async (file) => {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(data, "base64"));
    },
    /** A real key press, e.g. "Enter" or "Escape". */
    key: async (key) => {
      const base = { key, code: key, windowsVirtualKeyCode: KEYS[key] };
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(key === "Enter" ? { text: "\r" } : {}) });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    },
    /** Click the first element matching `selector` whose text contains `text`. */
    click: (selector, text = "") =>
      ev(`(() => { const el = [...document.querySelectorAll(${js(selector)})].find((e) => e.textContent.trim().includes(${js(text)})); if (!el) return false; el.click(); return true; })()`),
    /** Set an input, select or textarea the way React notices. */
    fill: (selector, value) =>
      ev(`(() => { const el = document.querySelector(${js(selector)}); if (!el) return false;
        const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${js(value)});
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.focus(); return true; })()`),
    /** Move the real mouse onto the middle of `selector`, or to a point { x, y }. */
    hover: async (target) => {
      const at = typeof target === "string"
        ? await ev(`(() => { const r = document.querySelector(${js(target)})?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`)
        : target;
      if (!at) return false;
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
      return true;
    },
    /** A real mouse click on the middle of `selector`: move there, press, release. */
    mouseClick: async (selector) => {
      const at = await ev(`(() => { const el = document.querySelector(${js(selector)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (!at) return false;
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
      return true;
    },
    /** Press a Radix trigger (they open on pointerdown, not click). */
    pointer: (selector) =>
      ev(`(() => { const b = document.querySelector(${js(selector)}); if (!b) return false; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); return true; })()`),
    /** Choose an item in an open dropdown menu. */
    menuItem: (text) =>
      ev(`(() => { const i = [...document.querySelectorAll('[role=menuitem]')].find((e) => e.textContent.trim().includes(${js(text)})); if (!i) return false;
        i.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
        i.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' })); i.click(); return true; })()`),
    /** Text of the toasts currently on screen. */
    toasts: () =>
      ev(`[...document.querySelectorAll('[data-sonner-toast]')].filter((t) => t.dataset.removed !== 'true').map((t) => t.innerText.replace(/\\s+/g, ' ')).join(' | ')`),
    /** Wait for a toast matching `re`; returns the toast text seen last. */
    waitToast: async (re, timeout = 6000) => (await until(async () => ((await page.toasts()) ?? "").match(re)?.input, { timeout })) ?? (await page.toasts()),
    close: () => cdp.close(),
  };
  return page;
}

/**
 * Start headless Chrome. `mouse`: report a fine, hover-capable pointer, as
 * a desktop with a mouse does. Headless Chrome reports none, and hover
 * styles (Tailwind's `hover:` waits for `(hover: hover)`) never apply
 * without one.
 */
export async function launchBrowser({ port = 9300 + Math.floor(Math.random() * 600), mouse = false } = {}) {
  // A profile of its own, removed afterwards. Left to itself, headless Chrome
  // makes one under ~/.config/google-chrome-headless per launch and, killed
  // rather than quit, never removes it: about 100 MB a run, until the disk fills.
  const profile = mkdtempSync(join(tmpdir(), "lighthouse-chrome-"));
  // Never let a profile that will not go yet fail the test.
  const removeProfile = () => {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  };
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`];
  if (mouse) args.push("--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4");
  // In a process group of its own, so Chrome and all its helpers stop at
  // once, before the profile goes, and none outlives a test that crashed.
  const chrome = spawn(process.env.CHROME ?? "google-chrome", [...args, "about:blank"], { stdio: "ignore", detached: true });
  const stop = () => {
    try {
      process.kill(-chrome.pid, "SIGKILL");
    } catch {
      chrome.kill("SIGKILL");
    }
  };
  process.once("exit", () => {
    stop();
    removeProfile();
  });
  const version = await until(
    async () => {
      try {
        return await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      } catch {
        return null;
      }
    },
    { timeout: 15000, interval: 250 }
  );
  if (!version) throw new Error("Chrome did not start. Set CHROME to its path if it is not `google-chrome`.");
  const browser = await connect(version.webSocketDebuggerUrl);
  const domain = new URL(APP_URL).hostname;

  return {
    /** A fresh cookie jar; `as` signs it in as that seeded user. */
    async newContext({ as } = {}) {
      const { browserContextId } = await browser.send("Target.createBrowserContext");
      if (as) {
        const cookies = [...(await sessionCookies(as))].map(([name, value]) => ({ name, value, domain, path: "/" }));
        await browser.send("Storage.setCookies", { browserContextId, cookies });
      }
      return { newPage: (options) => openPage(browser, port, browserContextId, options) };
    },
    close() {
      browser.close();
      stop();
    },
  };
}
