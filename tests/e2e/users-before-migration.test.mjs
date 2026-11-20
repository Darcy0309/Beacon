/**
 * Users & Access before migration 20270226 (client logins' projects) has run on a database (Sean, Nov 2026: the
 * page failed on live, then saving a user did): the list opens and an account saves, without those projects.
 * Renames the new column and table on the LOCAL database for the test, and puts them back.
 *
 *   node tests/run.mjs tests/e2e/users-before-migration.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `UBM${Date.now()}`;
const U = Number(sql(`insert into public.users (first_name, last_name, email, role, status) values ('Ubm', ${lit(TAG)}, ${lit(`${TAG.toLowerCase()}@example.test`)}, 'manager', 'active') returning id`));
const hide = () => sql(`alter table public.users rename column project_scope to project_scope_hidden; alter table public.client_user_projects rename to client_user_projects_hidden; notify pgrst, 'reload schema';`);
const restore = () => sql(`alter table public.users rename column project_scope_hidden to project_scope; alter table public.client_user_projects_hidden rename to client_user_projects; notify pgrst, 'reload schema';`);

const browser = await launchBrowser();
let hidden = false;
try {
  hide();
  hidden = true;
  await sleep(1500);
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 950 });

  section("The list");
  await admin.go(`/users?q=${encodeURIComponent(TAG)}`, 6000);
  check("Users & Access opens", Boolean(await until(() => admin.ev(`!!document.querySelector('button[aria-label="Actions for Ubm ${TAG}"]') && !/Something went wrong/.test(document.body.innerText)`), { timeout: 15000 })));

  section("Saving an account");
  await admin.pointer(`button[aria-label="Actions for Ubm ${TAG}"]`);
  await sleep(300);
  await admin.menuItem("Edit");
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] input[name="state"]')`));
  await admin.fill('[role=dialog] input[name="state"]', "WI");
  await admin.click("[role=dialog] button[type=submit]");
  const saved = await until(() => (sql(`select state from public.users where id = ${U}`) === "WI" ? "WI" : null), { timeout: 15000 });
  check("it saves, without which projects a client login sees", saved === "WI", `${saved} ${await admin.toasts()}`);
} finally {
  browser.close();
  if (hidden) restore();
  sql(`delete from public.users where id = ${U}`);
}

finish("users before migration");
