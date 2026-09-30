/**
 * Where the tests run: the local Supabase stack and the local app — never a
 * hosted project. Integration and end-to-end tests create, change and delete
 * real rows and accounts, so anything that is not this machine is refused
 * before a single request is made.
 *
 * Keys come from `supabase status` (the running local stack), or from
 * TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY / TEST_SUPABASE_SERVICE_ROLE_KEY.
 * The NEXT_PUBLIC_* variables and .env.local are deliberately NOT read: they
 * usually point at the hosted project.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

function fromSupabaseCli() {
  try {
    const out = execFileSync("supabase", ["status", "-o", "env"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Object.fromEntries(
      out.split("\n").map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]])
    );
  } catch {
    return {};
  }
}

const given = process.env.TEST_SUPABASE_URL;
const cli = given ? {} : fromSupabaseCli();

export const SUPABASE_URL = given ?? cli.API_URL;
export const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? cli.ANON_KEY;
export const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? cli.SERVICE_ROLE_KEY;
export const APP_URL = process.env.TEST_APP_URL ?? "http://localhost:3000";

/** The password every account in supabase/seed.sql is created with. */
export const PASSWORD = "Beacon!2026";

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("No local Supabase stack found. Start it with `npm run db:start`, or set TEST_SUPABASE_URL and TEST_SUPABASE_ANON_KEY.");
  process.exit(2);
}
for (const [name, url] of [["Supabase", SUPABASE_URL], ["App", APP_URL]]) {
  if (!LOCAL.test(url)) {
    console.error(`Refusing to run: the ${name} URL (${url}) is not local. These tests write data; point them at the local stack only.`);
    process.exit(2);
  }
}
