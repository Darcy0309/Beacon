/**
 * Users: the roles as Signature has them (Sean, Nov 2026: "Agents were always part of an agency/client …
 * Signature will never have agents"): Administrator, Account Manager, Client and Agent, an Agent being one of a
 * client's agents (a Client login kept to the projects ticked). The old staff Agent role shows only on an account
 * that still has it.
 *
 *   node tests/run.mjs tests/e2e/user-role-hints.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const company = sql("select id from public.companies where deleted_at is null order by id limit 1");
const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1400, height: 950 });
  await admin.go("/users", 5000);
  await admin.click("button", "Add user");
  await until(() => admin.ev(`!!document.querySelector('[data-role-select]')`));

  section("The roles");
  const labels = await admin.ev(`[...document.querySelectorAll('[data-role-select] option')].map((o) => o.textContent)`);
  check("Administrator, Account Manager, Client, Agent; no staff Agent", JSON.stringify(labels) === JSON.stringify(["Administrator", "Account Manager", "Client", "Agent"]), JSON.stringify(labels));
  check("…an Account Manager to begin with", (await admin.ev(`document.querySelector('[role=dialog] input[name="role"]')?.value`)) === "manager");

  section("An Agent");
  await admin.fill("[data-role-select]", "client_agent");
  await admin.fill('[role=dialog] select[name="company_id"]', company);
  const sent = await until(() => admin.ev(`(() => { const f = document.querySelector('[role=dialog] form'); return f && document.querySelector('[data-project-scope-field]') ? [f.querySelector('input[name="role"]').value, f.querySelector('input[name="project_scope"]').value] : null; })()`));
  check("saved as the client's login kept to the projects ticked, with them to tick", JSON.stringify(sent) === JSON.stringify(["client", "only"]), JSON.stringify(sent));
  await admin.fill("[data-role-select]", "client");
  check("a Client: all the client's projects, nothing to tick", Boolean(await until(() => admin.ev(`!document.querySelector('[data-project-scope-field]') && document.querySelector('[role=dialog] input[name="project_scope"]').value === 'all'`))));

  section("An account on the old staff role");
  await admin.go(`/users?q=${encodeURIComponent("agent@beacon.test")}`, 5000);
  const name = sql(`select btrim(concat_ws(' ', first_name, last_name)) from public.users where email = 'agent@beacon.test'`);
  await until(() => admin.ev(`!!document.querySelector('button[aria-label="Actions for ${name}"]')`));
  await admin.pointer(`button[aria-label="Actions for ${name}"]`);
  await sleep(300);
  await admin.menuItem("Edit");
  check("keeps it, said to be no longer used", (await until(() => admin.ev(`document.querySelector('[data-role-select] option[value="agent"]')?.textContent ?? null`))) === "Agent (old staff role)");
} finally {
  browser.close();
}

finish("user role hints");
