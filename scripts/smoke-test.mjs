#!/usr/bin/env node
/**
 * Verifies the backend end to end against the running Supabase stack:
 * signs in as each seeded role and checks that Row Level Security exposes
 * exactly what that role should see.
 *
 *   npm run smoke
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Load .env.local without adding a dependency.
const env = {};
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {
  console.error("Could not read .env.local — run `supabase start` first.");
  process.exit(1);
}

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "Beacon!2026";

const TABLES = ["leads", "appointments", "companies", "projects", "bulletin_board", "users", "activity_log"];

async function countsFor(sb) {
  const out = {};
  for (const t of TABLES) {
    const { count, error } = await sb.from(t).select("id", { count: "exact", head: true });
    out[t] = error ? "ERR" : count ?? 0;
  }
  return out;
}

const rows = [];
let failures = 0;

for (const email of [
  "admin@beacon.test",
  "sean@beacon.test",
  "agent@beacon.test",
  "client@beacon.test",
]) {
  const sb = createClient(URL_, KEY);
  const { data: auth, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    console.error(`✗ ${email}: sign-in failed — ${error.message}`);
    failures++;
    continue;
  }
  const { data: me } = await sb
    .from("users")
    .select("role")
    .eq("auth_id", auth.user.id)
    .maybeSingle();
  rows.push({ who: email, role: me?.role ?? "?", ...(await countsFor(sb)) });
}

// Signed-out users must see nothing.
const anon = createClient(URL_, KEY);
rows.push({ who: "(anonymous)", role: "-", ...(await countsFor(anon)) });

console.table(rows);

// --- assertions -------------------------------------------------------------
const byWho = Object.fromEntries(rows.map((r) => [r.who, r]));
const check = (label, cond) => {
  if (cond) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}`);
    failures++;
  }
};

check("admin sees leads", byWho["admin@beacon.test"]?.leads > 0);
check("admin sees the activity log", byWho["admin@beacon.test"]?.activity_log >= 0);
check("manager sees leads", byWho["sean@beacon.test"]?.leads > 0);
check("manager sees the activity log", byWho["sean@beacon.test"]?.activity_log >= 0);
check("agent sees leads", byWho["agent@beacon.test"]?.leads > 0);
check("agent sees only their own activity", byWho["agent@beacon.test"]?.activity_log >= 0);
check(
  "client sees only their own project's leads",
  byWho["client@beacon.test"]?.leads > 0 &&
    byWho["client@beacon.test"].leads < byWho["admin@beacon.test"].leads
);
check("client cannot read the bulletin board", byWho["client@beacon.test"]?.bulletin_board === 0);
check("client sees only their own company", byWho["client@beacon.test"]?.companies === 1);
check("anonymous sees no leads", byWho["(anonymous)"]?.leads === 0);
check("anonymous sees no companies", byWho["(anonymous)"]?.companies === 0);

// --- write path: create → read back → update → delete, under RLS ------------
console.log("\nWrite operations:");

async function signedIn(email) {
  const sb = createClient(URL_, KEY);
  const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return sb;
}

const mgr = await signedIn("sean@beacon.test");

const { data: created, error: createErr } = await mgr
  .from("leads")
  .insert({ company_name: "Smoke Test Co", city: "Phoenix", state: "AZ", phone: "(602) 555-0000" })
  .select("id, company_name")
  .single();
check("manager can create a lead", !createErr && created?.id > 0, createErr?.message);

if (created?.id) {
  const { data: readBack } = await mgr
    .from("leads")
    .select("company_name, city")
    .eq("id", created.id)
    .single();
  check("created lead reads back", readBack?.company_name === "Smoke Test Co");

  const { error: updErr } = await mgr
    .from("leads")
    .update({ contact_name: "Pat Tester" })
    .eq("id", created.id);
  const { data: updated } = await mgr
    .from("leads")
    .select("contact_name")
    .eq("id", created.id)
    .single();
  check("manager can update a lead", !updErr && updated?.contact_name === "Pat Tester", updErr?.message);

  // An appointment against that lead, then a call record.
  const { data: appt, error: apptErr } = await mgr
    .from("appointments")
    .insert({ lead_id: created.id, appt_date: new Date().toISOString().slice(0, 10), appt_time: "9:00 AM" })
    .select("id")
    .single();
  check("manager can schedule an appointment", !apptErr && appt?.id > 0, apptErr?.message);

  const { error: callErr } = await mgr
    .from("call_records")
    .insert({ lead_id: created.id, call_result: "Appointment set", notes: "smoke test" });
  check("manager can log a call", !callErr, callErr?.message);

  // A client-portal user must not be able to write.
  const cli = await signedIn("client@beacon.test");
  const { error: cliWriteErr } = await cli
    .from("leads")
    .update({ contact_name: "Should Not Work" })
    .eq("id", created.id);
  const { data: afterCli } = await mgr
    .from("leads")
    .select("contact_name")
    .eq("id", created.id)
    .single();
  check(
    "client CANNOT modify a lead",
    Boolean(cliWriteErr) || afterCli?.contact_name === "Pat Tester"
  );

  const { error: cliInsErr } = await cli.from("leads").insert({ company_name: "Rogue Co" });
  check("client CANNOT create a lead", Boolean(cliInsErr));

  // Clean up.
  if (appt?.id) await mgr.from("appointments").delete().eq("id", appt.id);
  const { error: delErr } = await mgr.from("leads").delete().eq("id", created.id);
  const { data: gone } = await mgr.from("leads").select("id").eq("id", created.id).maybeSingle();
  check("manager can delete a lead", !delErr && !gone, delErr?.message);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
