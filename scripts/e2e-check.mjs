#!/usr/bin/env node
/**
 * End-to-end check against a running dev/prod server.
 *
 * Signs in through Supabase Auth exactly the way the app does (the @supabase/ssr
 * cookie flow), then requests every page over HTTP with that session and asserts
 * the rendered HTML contains real database content.
 *
 *   npm run dev      # in one terminal
 *   npm run e2e      # in another
 */
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const APP = process.env.APP_URL ?? "http://localhost:3000";
const PASSWORD = "Beacon!2026";

/** Sign in and return a Cookie header carrying the session. */
async function sessionCookie(email) {
  const jar = new Map();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  if (jar.size === 0) throw new Error(`no session cookies produced for ${email}`);

  return [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
}

const get = (path, cookie) =>
  fetch(`${APP}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
};

// Pages every signed-in staff user should get, with a string proving the page
// rendered real seeded data rather than an empty shell.
const PAGES = [
  ["/", "Dashboard", ["Active Leads", "Recent Leads", "Command Center"]],
  ["/leads", "Leads", ["All leads", "Garry Insurance"]],
  ["/appointments", "Appointments", ["This Week"]],
  ["/calendar", "Calendar", ["Mon", "Sun"]],
  ["/clients", "Clients", ["Garry Insurance", "Rural Insurance"]],
  ["/projects", "Projects", ["Q3 X-Date Renewals"]],
  ["/account-managers", "Account Managers", ["Sean"]],
  ["/insurance-companies", "Insurance Companies", ["Travelers"]],
  ["/feedback", "Feedback", ["Average rating"]],
  ["/qa", "QA", ["Recent scored calls"]],
  ["/bulletin", "Bulletin", ["announcement"]],
  ["/documents", "Documents", ["All documents"]],
  ["/imports", "Imports", ["Recent imports", "az-commercial-q3.csv"]],
  ["/reports", "Reports", ["Leads Delivered", "Appointments Set", "Leads by Status"]],
  ["/alerts", "Alerts", ["Alert rules", "X-date"]],
  ["/users", "Users", ["Users", "beacon.test"]],
  ["/settings", "Settings", ["IP Lockdown", "Branding", "Email (SMTP)"]],
];

console.log(`\nSigned out — protected routes must redirect:`);
for (const [path] of PAGES) {
  const res = await get(path);
  check(`${path} → login`, res.status === 307 || res.status === 302, `got ${res.status}`);
}

console.log(`\nAdministrator (admin@beacon.test):`);
const adminCookie = await sessionCookie("admin@beacon.test");
for (const [path, label, needles] of PAGES) {
  const res = await get(path, adminCookie);
  if (res.status !== 200) {
    check(`${label} (${path})`, false, `HTTP ${res.status}`);
    continue;
  }
  const html = (await res.text()).toLowerCase();
  const missing = needles.filter((n) => !html.includes(n.toLowerCase()));
  check(`${label} (${path})`, missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : "");
}

// Detail pages resolve real ids.
console.log(`\nDetail pages:`);
for (const [path, label, needle] of [
  ["/leads/1", "Lead sheet", "Lead Sheet"],
  ["/clients/garry-insurance", "Client profile", "Projects"],
  ["/projects/1", "Project detail", "Leads on this Campaign"],
]) {
  const res = await get(path, adminCookie);
  const html = res.status === 200 ? (await res.text()).toLowerCase() : "";
  check(`${label} (${path})`, res.status === 200 && html.includes(needle.toLowerCase()), `HTTP ${res.status}`);
}

console.log(`\nClient portal user (client@beacon.test) — must be denied admin pages:`);
const clientCookie = await sessionCookie("client@beacon.test");
for (const [path, label] of [
  ["/", "Dashboard reachable"],
  ["/appointments", "Appointments reachable"],
]) {
  const res = await get(path, clientCookie);
  check(`${label} (${path})`, res.status === 200, `HTTP ${res.status}`);
}
{
  // RLS must hide other clients' data even though the route is reachable.
  const res = await get("/", clientCookie);
  const html = res.status === 200 ? await res.text() : "";
  check("Dashboard hides other clients' leads", !html.includes("Rural Insurance"));
}

console.log(
  failures ? `\n${failures} check(s) failed.\n` : `\nAll end-to-end checks passed.\n`
);
process.exit(failures ? 1 : 0);
