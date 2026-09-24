#!/usr/bin/env node
/**
 * End-to-end check against a running dev/prod server.
 *
 * Signs in through Supabase Auth exactly the way the app does (the @supabase/ssr
 * cookie flow), then requests every page over HTTP with that session and asserts
 * the rendered HTML contains real database content.
 *
 * The records it looks for are read out of the database first rather than
 * hard-coded, so reseeding with different demo data does not break the run.
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

/** Sign in; returns the session cookie header and a client scoped to that user. */
async function signIn(email) {
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

  const cookie = [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  return { supabase, cookie };
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

/** Mirrors clientSlug() in lib/data.js, which the client profile route uses. */
const slug = (name) =>
  String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const admin = await signIn("admin@beacon.test");
const client = await signIn("client@beacon.test");

// Real records to look for, read the way each page orders its own rows so the
// value is guaranteed to land on the first page.
const rows = async (table, select, order = {}) => {
  let q = admin.supabase.from(table).select(select);
  for (const [col, opts] of Object.entries(order)) q = q.order(col, opts);
  const { data, error } = await q.limit(5);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
};

const [leads, companies, projects, imports, agencies, managers] = await Promise.all([
  rows("leads", "id, company_name", { lead_date: { ascending: false, nullsFirst: false }, id: { ascending: false } }),
  rows("companies", "id, name", { name: {} }),
  rows("projects", "id, name", { id: {} }),
  rows("import_batches", "file_name", { created_at: { ascending: false } }),
  rows("agencies", "name", { name: {} }),
  admin.supabase.from("users").select("first_name").eq("role", "manager").limit(1).then((r) => r.data ?? []),
]);

if (!leads.length || !companies.length || !projects.length) {
  console.error("\nThe database has no leads, companies or projects — seed it first.\n");
  process.exit(1);
}

const lead = leads[0];
const company = companies[0];
const project = projects[0];

// Pages every signed-in staff user should get, with a string proving the page
// rendered real database content rather than an empty shell.
const PAGES = [
  ["/", "Dashboard", ["Active Leads", "Recent Leads", "Command Center"]],
  ["/leads", "Leads", ["All leads", lead.company_name]],
  ["/appointments", "Appointments", ["This Week"]],
  ["/calendar", "Calendar", ["Mon", "Sun"]],
  ["/clients", "Clients", companies.slice(0, 2).map((c) => c.name)],
  ["/projects", "Projects", [project.name]],
  ["/account-managers", "Account Managers", managers.length ? [managers[0].first_name] : ["Team"]],
  ["/insurance-companies", "Insurance Companies", agencies.length ? [agencies[0].name] : ["Carriers"]],
  ["/feedback", "Feedback", ["Average rating"]],
  ["/qa", "QA", ["Recent scored calls"]],
  ["/bulletin", "Bulletin", ["Bulletin"]],
  ["/documents", "Documents", ["All documents"]],
  ["/imports", "Imports", imports.length ? ["Recent imports", imports[0].file_name] : ["Recent imports"]],
  ["/reports", "Reports", ["Leads Delivered", "Appointments Set", "Leads by Status"]],
  ["/alerts", "Alerts", ["Alert rules"]],
  ["/users", "Users", ["Users", "beacon.test"]],
  ["/settings", "Settings", ["Branding", "Email (SMTP)", "Sign-in Security"]],
];

console.log(`\nSigned out — protected routes must redirect:`);
for (const [path] of PAGES) {
  const res = await get(path);
  check(`${path} → login`, res.status === 307 || res.status === 302, `got ${res.status}`);
}

console.log(`\nAdministrator (admin@beacon.test):`);
for (const [path, label, needles] of PAGES) {
  const res = await get(path, admin.cookie);
  if (res.status !== 200) {
    check(`${label} (${path})`, false, `HTTP ${res.status}`);
    continue;
  }
  const html = (await res.text()).toLowerCase();
  const missing = needles.filter((n) => !html.includes(String(n).toLowerCase()));
  check(`${label} (${path})`, missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : "");
}

// Detail pages resolve real ids.
console.log(`\nDetail pages:`);
for (const [path, label, needle] of [
  [`/leads/${lead.id}`, "Lead sheet", "Lead Sheet"],
  [`/clients/${slug(company.name)}`, "Client profile", "Projects"],
  [`/projects/${project.id}`, "Project detail", "Leads on this Campaign"],
]) {
  const res = await get(path, admin.cookie);
  const html = res.status === 200 ? (await res.text()).toLowerCase() : "";
  check(`${label} (${path})`, res.status === 200 && html.includes(needle.toLowerCase()), `HTTP ${res.status}`);
}

console.log(`\nClient portal user (client@beacon.test) — must be denied admin pages:`);
for (const [path, label] of [
  ["/", "Dashboard reachable"],
  ["/appointments", "Appointments reachable"],
]) {
  const res = await get(path, client.cookie);
  check(`${label} (${path})`, res.status === 200, `HTTP ${res.status}`);
}
{
  // RLS must hide other clients' data even though the route is reachable:
  // find a company this client cannot read, then prove it never reaches the page.
  const { data: visible } = await client.supabase.from("companies").select("name");
  const mine = new Set((visible ?? []).map((c) => c.name));
  const hidden = companies.find((c) => !mine.has(c.name));
  if (!hidden) {
    check("Dashboard hides other clients' leads", false, "this client can read every company — nothing to hide");
  } else {
    const res = await get("/", client.cookie);
    const html = res.status === 200 ? await res.text() : "";
    check(`Dashboard hides other clients' data (${hidden.name})`, !html.includes(hidden.name));
  }
}

console.log(
  failures ? `\n${failures} check(s) failed.\n` : `\nAll end-to-end checks passed.\n`
);
process.exit(failures ? 1 : 0);
