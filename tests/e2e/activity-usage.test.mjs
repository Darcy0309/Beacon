/**
 * Activity Log, Usage by Account (Sean, Nov 2026: "add a filter … so we can select Client, Agent, or Manager"):
 * each kind of account to show (a client's own logins, its agents (logins kept to some of its projects),
 * managers, …) and, for clients' logins, one client; each client login says which client.
 *
 *   node tests/run.mjs tests/e2e/activity-usage.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `AU-TEST ${Date.now()}`;
const co = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Ins`)}) returning id`));
const user = (first, scope) => Number(sql(`insert into public.users (first_name, last_name, email, role, status, company_id, project_scope)
  values (${lit(first)}, 'Zz', ${lit(`${first.toLowerCase()}.${Date.now()}@example.test`)}, 'client', 'active', ${co}, '${scope}') returning id`));
const OWNER = user("Owner", "all");
const PRODUCER = user("Producer", "only");
const SEAN = Number(sql(`select id from public.users where email = 'sean@beacon.test'`));

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await admin.go("/activity", 7000);
  await until(() => admin.ev(`!!document.querySelector('[data-usage-row="${PRODUCER}"]')`), { timeout: 15000 });
  const shown = () => admin.ev(`[...document.querySelectorAll('[data-usage-row]')].map((r) => Number(r.dataset.usageRow))`);

  section("Kinds of account");
  const chips = await admin.ev(`[...document.querySelectorAll('[data-usage-kind]')].map((b) => b.textContent.split(' · ')[0])`);
  check("All, Clients, Client agents, Managers… to choose", chips[0] === "All" && chips.includes("Clients") && chips.includes("Client agents") && chips.includes("Managers"), JSON.stringify(chips));
  await admin.click('[data-usage-kind="client"]');
  let ids = await shown();
  check("Clients: the client's own login, not its agent nor a manager", ids.includes(OWNER) && !ids.includes(PRODUCER) && !ids.includes(SEAN), JSON.stringify(ids));
  await admin.click('[data-usage-kind="client_agent"]');
  ids = await shown();
  check("Client agents: the login kept to some projects", ids.includes(PRODUCER) && !ids.includes(OWNER), JSON.stringify(ids));
  const named = await admin.ev(`(() => { const c = document.querySelector('[data-usage-row="${PRODUCER}"] td:nth-child(2)'); return c ? [c.querySelector('[data-badge]')?.textContent.trim(), c.querySelector('div')?.textContent.trim()] : null; })()`);
  check("…named Client agent, with its client", named?.[0] === "Client agent" && named?.[1] === `${TAG} Capital Ins`, JSON.stringify(named));
  await admin.click('[data-usage-kind="manager"]');
  ids = await shown();
  check("Managers: only managers", ids.includes(SEAN) && !ids.includes(OWNER) && !ids.includes(PRODUCER), JSON.stringify(ids));

  section("One client");
  await admin.click('[data-usage-kind=""]');
  await admin.fill("[data-usage-client]", `${TAG} Capital Ins`);
  ids = await shown();
  check("its logins, the owner's and its agent's, only", ids.length === 2 && ids.includes(OWNER) && ids.includes(PRODUCER), JSON.stringify(ids));

  section("Users & Access opens");
  await admin.go("/users", 6000);
  check("the Users list, no error", Boolean(await until(() => admin.ev(`!!document.querySelector('tbody tr') && !/Something went wrong/.test(document.body.innerText)`), { timeout: 15000 })));
} finally {
  browser.close();
  sql(`delete from public.users where id in (${OWNER}, ${PRODUCER})`);
  sql(`delete from public.companies where id = ${co}`);
}

finish("activity usage");
