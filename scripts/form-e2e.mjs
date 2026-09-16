#!/usr/bin/env node
/**
 * Real-browser validation test. Drives headless Chrome over the DevTools
 * protocol (Node's built-in WebSocket, no deps): signs in, opens the New Lead
 * dialog, submits invalid data, and asserts inline errors appear and nothing
 * was written. Then submits valid data and asserts the lead exists.
 *
 *   APP_URL=http://localhost:3100 node scripts/form-e2e.mjs
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";

const env = {};
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const APP = process.env.APP_URL ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "/tmp/form-e2e";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (l, c, d = "") => { if (c) console.log(`✓ ${l}`); else { console.error(`✗ ${l}${d ? ` — ${d}` : ""}`); failures++; } };

// --- sign in, capture cookies ---------------------------------------------
const jar = new Map();
const ssr = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) },
});
{ const { error } = await ssr.auth.signInWithPassword({ email: "sean@beacon.test", password: "Beacon!2026" }); if (error) throw error; }

// --- launch chrome ----------------------------------------------------------
const profile = `${OUT}/profile`; rmSync(profile, { recursive: true, force: true });
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9333", `--user-data-dir=${profile}`, "--window-size=1440,1100", "about:blank",
], { stdio: "ignore" });
process.on("exit", () => chrome.kill());

let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch("http://127.0.0.1:9333/json/version")).json()).webSocketDebuggerUrl; } catch { await sleep(250); }
}
if (!wsUrl) throw new Error("Chrome did not expose DevTools");

// --- tiny CDP client --------------------------------------------------------
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pending = new Map(); const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
  else if (msg.method) events.push(msg);
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const cdp = (m, p) => send(m, p, sessionId);
await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");

const host = new URL(APP).hostname;
for (const [name, value] of jar) await cdp("Network.setCookie", { name, value, domain: host, path: "/" });

const evalJs = async (expression) => {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description ?? ""));
  return r.result.value;
};
const shot = async (name) => { const { data } = await cdp("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64")); };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await evalJs(expr)) return true; await sleep(150); } return false; };

// --- open /leads and the New Lead dialog ---------------------------------
await cdp("Page.navigate", { url: `${APP}/leads` });
check("leads page loads signed in", await waitFor(`!!document.querySelector('table')`, 15000));
await evalJs(`[...document.querySelectorAll('button')].find(b => /new lead/i.test(b.textContent)).click()`);
check("New Lead dialog opens", await waitFor(`!!document.querySelector('[role="dialog"] form input[name="company_name"]')`));

// --- 1) invalid submit ------------------------------------------------------
const marker = `E2E ${Date.now()}`;
await evalJs(`(() => {
  const set = (n, v) => { const el = document.querySelector('[role="dialog"] form [name="' + n + '"]'); const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('company_name', '');          // required
  set('state', 'Freedonia');        // not a state
  set('email', 'not-an-email');     // bad email
  set('employees', 'lots');         // not a number
  set('zip', '123');                // too short
  document.querySelector('[role="dialog"] form button[type="submit"]').click();
})()`);
check("inline errors render after invalid submit", await waitFor(`document.querySelectorAll('[role="dialog"] form [role="alert"]').length >= 5`));
const errs = await evalJs(`[...document.querySelectorAll('[role="dialog"] form [role="alert"]')].map(e => e.textContent.trim())`);
console.log("   errors shown:", errs);
check("company name error", errs.some((e) => /company name is required/i.test(e)));
check("state error", errs.some((e) => /state code/i.test(e)));
check("email error", errs.some((e) => /valid email/i.test(e)));
check("employees error", errs.some((e) => /whole number/i.test(e)));
check("zip error", errs.some((e) => /zip/i.test(e)));
check("invalid inputs are marked aria-invalid", (await evalJs(`document.querySelectorAll('[role="dialog"] form [aria-invalid="true"]').length`)) >= 5);
check("dialog stays open on error", await evalJs(`!!document.querySelector('[role="dialog"] form input[name="company_name"]')`));
check("user's typed values are preserved", (await evalJs(`document.querySelector('[role="dialog"] form [name="state"]').value`)) === "Freedonia");
await shot("lead-form-invalid");

// nothing should have been written
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
await admin.auth.signInWithPassword({ email: "sean@beacon.test", password: "Beacon!2026" });
{ const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("email", "not-an-email");
  check("invalid submit wrote nothing to the database", count === 0); }

// --- 2) valid submit ----------------------------------------------------------
await evalJs(`(() => {
  const set = (n, v) => { const el = document.querySelector('[role="dialog"] form [name="' + n + '"]'); const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('company_name', ${JSON.stringify(marker)});
  set('state', 'AZ'); set('email', 'ok@example.test'); set('employees', '12'); set('zip', '85016');
  document.querySelector('[role="dialog"] form button[type="submit"]').click();
})()`);
check("dialog closes after valid submit", await waitFor(`!document.querySelector('[role="dialog"] form input[name="company_name"]')`, 10000));
await sleep(600);
{ const { data } = await admin.from("leads").select("id, state, email").eq("company_name", marker).maybeSingle();
  check("valid submit created the lead", Boolean(data?.id));
  check("state was stored as the 2-letter code", data?.state === "AZ");
  if (data?.id) await admin.from("leads").delete().eq("id", data.id); }
await shot("lead-form-after-valid");

ws.close(); chrome.kill();
console.log(failures ? `\n${failures} check(s) failed. Screenshots in ${OUT}\n` : `\nBrowser validation test passed. Screenshots in ${OUT}\n`);
process.exit(failures ? 1 : 0);
