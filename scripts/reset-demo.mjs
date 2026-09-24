#!/usr/bin/env node
/**
 * Clears the business records from a Lighthouse database and rebuilds it as
 * three clients with two projects each, then imports a lead list into any
 * project that has one.
 *
 *   node scripts/reset-demo.mjs --dry-run      # say what it would do
 *   node scripts/reset-demo.mjs --confirm      # actually do it
 *
 * Sign-in accounts, roles and the lookup tables (statuses, types, timezones,
 * SIC codes, settings) are left alone — wiping those would lock everyone out.
 *
 * Point it at a database with .env.local, or override:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/reset-demo.mjs --confirm
 */
import { createClient } from "@supabase/supabase-js";
import { fetch as undiciFetch, Agent } from "undici";
import { readFileSync, existsSync } from "node:fs";
import { parseCsv, rowsToImport } from "../lib/csv.js";

// The hosted database is reliable once a socket is warm but slow — sometimes
// unresponsive — on a fresh connection, and this script makes hundreds of
// calls. Same shape as the app's transport: a small keep-alive pool and
// generous budgets. Only reads are retried: a write that times out may well
// have landed, and repeating it duplicates rows.
const agent = new Agent({
  connections: 4,
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 60_000,
  connectTimeout: 10_000,
  headersTimeout: 60_000,
  bodyTimeout: 60_000,
});

const retryingFetch = async (url, init = {}) => {
  const method = String(init.method ?? "GET").toUpperCase();
  const budgets = method === "GET" || method === "HEAD" ? [30_000, 20_000, 20_000] : [60_000];

  let lastError;
  for (const budget of budgets) {
    try {
      return await undiciFetch(url, { ...init, signal: AbortSignal.timeout(budget), dispatcher: agent });
    } catch (err) {
      lastError = err;
      if (budgets.length > 1) process.stdout.write("  (retrying a slow read)\n");
    }
  }
  throw lastError;
};

const args = process.argv.slice(2);
const DRY_RUN = !args.includes("--confirm") && !args.includes("--fill");
// --fill adds whatever is missing without clearing anything, so a run cut
// short by a slow database can be finished without re-importing the lists.
const FILL_ONLY = args.includes("--fill");

// --- the structure to build ------------------------------------------------
// `list` is a path to that project's CSV, or null until the client sends one.
const CLIENTS = [
  {
    name: "Capital Insurance Services-InsurancePros",
    city: "Phoenix",
    state: "AZ",
    projects: [
      {
        name: "CapitalIns-InsProsOfAZ_BretGodsey_2026",
        type: "DBDV",
        description: "Maricopa & Pinal contractors — X-date development",
        state: "AZ",
        list: "/home/momo/TestProject_2026-09-23.csv",
        listSource: "IPA-Maricopa-BRET_ClientLeads_2026",
      },
      {
        name: "CapitalIns-InsProsOfAZ_Appointments_2026",
        type: "APPT",
        description: "Appointment setting from the developed X-dates",
        state: "AZ",
        list: null,
      },
    ],
  },
  // Stand-ins until the client names his other two accounts. Named to his own
  // convention so the demo reads as a working book of business; the leads
  // underneath are all marked SAMPLE.
  {
    name: "Heartland Insurance Group-MidwestPros",
    city: "Cedar Rapids",
    state: "IA",
    projects: [
      {
        name: "HeartlandIns-MidwestPros_DaleWinters_2026",
        type: "DBDV",
        description: "Linn & Polk county trades — X-date development",
        state: "IA",
        list: null,
      },
      {
        name: "HeartlandIns-MidwestPros_Appointments_2026",
        type: "APPT",
        description: "Appointment setting from the developed X-dates",
        state: "IA",
        list: null,
      },
    ],
  },
  {
    name: "Summit Risk Partners-MountainWest",
    city: "Denver",
    state: "CO",
    projects: [
      {
        name: "SummitRisk-MtnWestCO_ReneeAldridge_2026",
        type: "DBDV",
        description: "Front Range contractors — X-date development",
        state: "CO",
        list: null,
      },
      {
        name: "SummitRisk-MtnWestCO_Appointments_2026",
        type: "APPT",
        description: "Appointment setting from the developed X-dates",
        state: "CO",
        list: null,
      },
    ],
  },
];

// Emptied in this order so a child never outlives its parent.
const WIPE_ORDER = [
  "activity_log", "alert_log", "import_batches", "call_records", "feedback",
  "appointments", "insurance_details", "leads", "documents", "bulletin_board",
  "project_assignments", "projects", "companies",
];

// --- connect ---------------------------------------------------------------
const env = {};
if (existsSync(new URL("../.env.local", import.meta.url))) {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}
const URL_ = process.env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@beacon.test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Beacon!2026";

if (!URL_) {
  console.error("No Supabase URL. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env.local.");
  process.exit(1);
}

let sb;
if (KEY) {
  sb = createClient(URL_, KEY, { auth: { persistSession: false }, global: { fetch: retryingFetch } });
} else {
  // No service key: act as the administrator, which Row Level Security allows.
  sb = createClient(URL_, ANON, { auth: { persistSession: false }, global: { fetch: retryingFetch } });
  const { error } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error) {
    console.error(`Could not sign in as ${ADMIN_EMAIL}: ${error.message}`);
    console.error("Set SUPABASE_SERVICE_KEY, or ADMIN_EMAIL / ADMIN_PASSWORD.");
    process.exit(1);
  }
}

console.log(`\nDatabase: ${URL_}`);
console.log(
  DRY_RUN
    ? "Mode:     DRY RUN — nothing will be changed\n"
    : FILL_ONLY
      ? "Mode:     FILL — adding what is missing, deleting nothing\n"
      : "Mode:     LIVE — records will be deleted\n"
);

// --- what is there now -----------------------------------------------------
console.log("Currently holds:");
for (const table of WIPE_ORDER) {
  const { count, error } = await sb.from(table).select("id", { count: "exact", head: true });
  console.log(`  ${table.padEnd(20)} ${error ? `(${error.code})` : `${count ?? 0} rows`}`);
}

// --- check the lists parse before deleting anything ------------------------
console.log("\nLists to import:");
const lists = new Map();
for (const client of CLIENTS) {
  for (const project of client.projects) {
    if (!project.list) {
      console.log(`  ${project.name.padEnd(42)} — no list yet`);
      continue;
    }
    if (!existsSync(project.list)) {
      console.error(`  ${project.name.padEnd(42)} MISSING FILE: ${project.list}`);
      process.exit(1);
    }
    const parsed = rowsToImport(parseCsv(readFileSync(project.list, "utf8")));
    lists.set(project.name, parsed);
    const appts = parsed.rows.filter((r) => r.appointment).length;
    const details = parsed.rows.filter((r) => r.insurance).length;
    console.log(`  ${project.name.padEnd(42)} ${parsed.rows.length} leads · ${details} with X-dates · ${appts} appointments · ${parsed.errors} skipped`);
  }
}

if (DRY_RUN) {
  console.log("\nDry run — re-run with --confirm to apply.\n");
  process.exit(0);
}

// --- wipe ------------------------------------------------------------------
if (!FILL_ONLY) {
console.log("\nClearing business records…");
for (const table of WIPE_ORDER) {
  const { error } = await sb.from(table).delete().gte("id", 0);
  if (error) {
    console.error(`  ${table}: ${error.message}`);
    process.exit(1);
  }
  console.log(`  ${table} cleared`);
}
}

// --- rebuild ---------------------------------------------------------------
const lookup = async (table, column, value) => {
  if (!value) return null;
  const { data } = await sb.from(table).select("id").eq(column, value).maybeSingle();
  return data?.id ?? null;
};

const { data: managers } = await sb
  .from("users")
  .select("id, first_name, last_name")
  .in("role", ["manager", "agent"])
  .order("id");

const activeStatusId = await lookup("project_statuses", "name", "Active");
const { data: statusRows } = await sb.from("lead_statuses").select("id, code");
const statusId = Object.fromEntries((statusRows ?? []).map((r) => [r.code, r.id]));
const scheduledId = await lookup("appointment_statuses", "name", "Scheduled");
const { data: admin } = await sb.from("users").select("id").eq("role", "admin").limit(1).maybeSingle();

console.log("\nBuilding clients and projects…");
let assignmentTurn = 0;

for (const client of CLIENTS) {
  let company = null;
  if (FILL_ONLY) {
    const { data } = await sb.from("companies").select("id").eq("name", client.name).maybeSingle();
    company = data ?? null;
  }
  if (company) {
    console.log(`  ${client.name} (already there)`);
  } else {
    const { data, error: companyError } = await sb
      .from("companies")
      .insert({ name: client.name, city: client.city, state: client.state, status: "active" })
      .select("id")
      .single();
    if (companyError) {
      console.error(`  ${client.name}: ${companyError.message}`);
      process.exit(1);
    }
    company = data;
    console.log(`  ${client.name}`);
  }

  for (const project of client.projects) {
    let existing = null;
    if (FILL_ONLY) {
      const { data } = await sb.from("projects").select("id").eq("name", project.name).maybeSingle();
      existing = data ?? null;
    }

    const typeId = await lookup("project_types", "code", project.type);
    const { data: row, error: projectError } = existing
      ? { data: existing, error: null }
      : await sb
      .from("projects")
      .insert({
        company_id: company.id,
        name: project.name,
        project_type_id: typeId,
        status_id: activeStatusId,
        description: project.description,
        client_name: client.name,
        state: project.state,
        start_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (projectError) {
      console.error(`    ${project.name}: ${projectError.message}`);
      process.exit(1);
    }

    // Spread the projects across the account managers, round robin.
    const manager = managers?.[assignmentTurn++ % Math.max(1, managers?.length ?? 1)];
    if (manager) {
      const { count } = await sb
        .from("project_assignments")
        .select("id", { count: "exact", head: true })
        .eq("project_id", row.id);
      if (!count) {
        await sb.from("project_assignments").insert({ project_id: row.id, ae_user_id: manager.id });
      }
    }

    const parsed = lists.get(project.name);
    if (!parsed) {
      console.log(`    ${project.name} — ${existing ? "already there" : "created"}, no list yet`);
      continue;
    }

    if (existing) {
      const { count } = await sb
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("project_id", row.id);
      if (count) {
        console.log(`    ${project.name} — already holds ${count} leads, left alone`);
        continue;
      }
    }

    const now = new Date().toISOString();
    let imported = 0;
    let details = 0;
    let appointments = 0;

    for (let i = 0; i < parsed.rows.length; i += 250) {
      const chunk = parsed.rows.slice(i, i + 250);
      const payload = chunk.map(({ lead, status }) => ({
        ...lead,
        project_id: row.id,
        status_id: statusId[status] ?? statusId.new ?? null,
        assigned_user_id: manager?.id ?? null,
        list_source: lead.list_source || project.listSource || null,
        lead_date: now,
        import_date: now,
      }));

      const { data: inserted, error } = await sb.from("leads").insert(payload).select("id");
      if (error) {
        console.error(`    lead chunk failed: ${error.message}`);
        process.exit(1);
      }
      imported += inserted.length;

      const insuranceRows = [];
      const appointmentRows = [];
      inserted.forEach((leadRow, j) => {
        const source = chunk[j];
        if (source?.insurance) insuranceRows.push({ lead_id: leadRow.id, ...source.insurance });
        if (source?.appointment) {
          appointmentRows.push({
            lead_id: leadRow.id,
            user_id: manager?.id ?? null,
            appt_date: source.appointment.appt_date,
            appt_time: source.appointment.appt_time ?? null,
            status_id: scheduledId,
            rep_name: source.lead.producer_name ?? null,
            list_source: source.lead.list_source ?? null,
            appt_create_date: now,
          });
        }
      });

      if (insuranceRows.length) {
        const { error: insError } = await sb.from("insurance_details").insert(insuranceRows);
        if (insError) console.error(`    insurance rows: ${insError.message}`);
        else details += insuranceRows.length;
      }
      if (appointmentRows.length) {
        const { error: apptError } = await sb.from("appointments").insert(appointmentRows);
        if (apptError) console.error(`    appointments: ${apptError.message}`);
        else appointments += appointmentRows.length;
      }
    }

    await sb.from("import_batches").insert({
      file_name: project.list.split("/").pop(),
      source: project.listSource ?? null,
      project_id: row.id,
      row_count: parsed.rows.length + parsed.errors,
      imported_count: imported,
      error_count: parsed.errors,
      status: "completed",
      imported_by: admin?.id ?? null,
    });

    console.log(`    ${project.name} — ${imported} leads, ${details} X-date records, ${appointments} appointments`);
  }
}

console.log("\nDone. Final counts:");
for (const table of WIPE_ORDER) {
  const { count } = await sb.from(table).select("id", { count: "exact", head: true });
  console.log(`  ${table.padEnd(20)} ${count ?? 0} rows`);
}
console.log();
await agent.close();
