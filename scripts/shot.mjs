#!/usr/bin/env node
/**
 * Screenshots app pages as a signed-in user, so the UI can be reviewed as it
 * actually renders.
 *
 * Chrome has no CLI flag for cookies, so this fetches the server-rendered HTML
 * with a real session, rewrites it to load assets from the dev server via a
 * <base> tag, then screenshots that local copy.
 *
 *   node scripts/shot.mjs <outDir> <path> [path...]
 *   AS=client@beacon.test node scripts/shot.mjs out /leads
 */
import { createServerClient } from "@supabase/ssr";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const APP = process.env.APP_URL ?? "http://localhost:3000";
const WIDTH = process.env.W ?? "1440";
const HEIGHT = process.env.H ?? "1150";
const [outDir, ...paths] = process.argv.slice(2);
if (!outDir || paths.length === 0) {
  console.error("usage: shot.mjs <outDir> <path> [path...]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const jar = new Map();
const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
  },
});
let cookie = "";
if (process.env.AS !== "none") {
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.AS ?? "admin@beacon.test",
    password: "Beacon!2026",
  });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  cookie = [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
}

for (const p of paths) {
  const res = await fetch(`${APP}${p}`, { headers: { cookie } });
  if (res.status !== 200) {
    console.error(`skip ${p} — HTTP ${res.status}`);
    continue;
  }
  let html = await res.text();

  // Load CSS/fonts from the dev server; drop the client bundle so hydration
  // does not try to re-fetch data cross-origin from file://.
  html = html
    .replace(/<html([^>]*)class="([^"]*)"/i, '<html$1class="$2 dark"')
    .replace(/<head>/i, `<head><base href="${APP}/">`)
    .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/gi, "")
    .replace(/<script>self\.__next_f[\s\S]*?<\/script>/gi, "");

  const name = p === "/" ? "home" : p.replace(/^\//, "").replace(/\//g, "_");
  const htmlFile = resolve(outDir, `${name}.html`);
  const png = resolve(outDir, `${name}.png`);
  writeFileSync(htmlFile, html);

  execFileSync("google-chrome", [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--allow-file-access-from-files",
    `--window-size=${WIDTH},${HEIGHT}`,
    "--virtual-time-budget=8000",
    `--screenshot=${png}`,
    `file://${htmlFile}`,
  ], { stdio: "ignore" });

  console.log("shot", png);
}
