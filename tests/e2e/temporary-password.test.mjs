/**
 * Signing in with a temporary password (Sean, Oct 2026: "it gives me this
 * error message and nothing works", as a manager and as a client). Someone
 * with a temporary password is sent to My Security to set their own, so
 * that page must open whatever else is wrong. It did not where a second
 * link from the activity log to users had been left behind (an abandoned
 * migration): "whose activity is this" became ambiguous and the page threw.
 *
 * Puts that link back for the test, then runs the migration that removes it.
 *
 *   node tests/run.mjs tests/e2e/temporary-password.test.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { ROOT } from "../support/env.mjs";
import { launchBrowser } from "../support/browser.mjs";

const container = `supabase_db_${readFileSync(`${ROOT}/supabase/config.toml`, "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)[1]}`;
const runFile = (file) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: readFileSync(`${ROOT}/${file}`), stdio: ["pipe", "ignore", "ignore"] });
const links = () => sql("select count(*) from pg_constraint where conrelid = 'public.activity_log'::regclass and confrelid = 'public.users'::regclass");

// What was left behind, and two people given temporary passwords.
sql("alter table public.activity_log add column if not exists acting_admin_id bigint references public.users(id) on delete set null");
sql("notify pgrst, 'reload schema'");
sql("update public.users set must_change_password = true where email in ('mike@beacon.test', 'client@beacon.test')");
await sleep(2500);

const browser = await launchBrowser();
const opened = async (page) => {
  const text = await until(async () => { const t = await page.text(); return /Set your password|Something went wrong/i.test(t) ? t : null; }, { timeout: 15000 });
  return { text: text ?? (await page.text()), path: await page.path() };
};
try {
  check("the test starts as the live database was: two links from the activity log to users", links() === "2", links());

  for (const [who, email] of [["an account manager", "mike@beacon.test"], ["a client", "client@beacon.test"]]) {
    section(`A temporary password: ${who}`);
    const page = await (await browser.newContext({ as: email })).newPage({ width: 1280, height: 900 });
    await page.go("/", 5000);
    const at = await opened(page);
    check("is taken to My Security", at.path === "/security", at.path);
    check("…which opens, asking for a password of their own", /Set your password/i.test(at.text) && !/Something went wrong/i.test(at.text), at.text.slice(0, 200));
    await page.go("/calendar", 4000);
    const again = await opened(page);
    check("…and nowhere else until they do", again.path === "/security" && !/Something went wrong/.test(again.text), again.path);
    page.close();
  }

  section("An administrator");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1280, height: 900 });
  await admin.go("/security", 5000);
  check("My Security opens", /Two-Factor Authentication/i.test(await admin.text()) && !/Something went wrong/.test(await admin.text()));
  await admin.go("/activity", 5000);
  check("the Activity page opens, each row with who did it", !/Something went wrong/.test(await admin.text()) && (await admin.ev(`document.querySelectorAll('[data-list-row], tbody tr').length`)) > 0);

  section("The migration that removes what was left");
  runFile("supabase/migrations/20261106100000_remove_session_takeover.sql");
  check("one link from the activity log to users again", links() === "1", links());
  check("…and the column is gone", sql("select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'activity_log' and column_name = 'acting_admin_id'") === "0");
  runFile("supabase/migrations/20261106100000_remove_session_takeover.sql");
  check("running it again changes nothing", links() === "1");
  await sleep(2500);
  await admin.go("/activity", 5000);
  check("the Activity page still opens", !/Something went wrong/.test(await admin.text()));
  const mike = await (await browser.newContext({ as: "mike@beacon.test" })).newPage({ width: 1280, height: 900 });
  await mike.go("/", 5000);
  check("…and so does My Security for the manager", /Set your password/i.test((await opened(mike)).text));
} finally {
  browser.close();
  sql("update public.users set must_change_password = false where email in ('mike@beacon.test', 'client@beacon.test')");
  sql("alter table public.activity_log drop column if exists acting_admin_id");
  sql("notify pgrst, 'reload schema'");
}

finish("temporary password");
