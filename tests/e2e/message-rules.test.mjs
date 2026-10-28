/**
 * Who may message whom (Sean, Oct 2026). An administrator sending to "All
 * clients" is asked first (Cancel sends nothing). An account manager has no
 * "All …" choices: they send to their own projects (the client's people and
 * the project's reps), and the administrators get a copy of what goes to
 * clients or agents; the database refuses a manager's message to everyone in
 * a role or to a project they aren't on. No Link box: a web address or a
 * Lighthouse page written in the message is a link. A message on the
 * dashboard's schedule opens the message, not its link.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `MR-TEST ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const ADMIN = userId("admin@beacon.test"), SEAN = userId("sean@beacon.test"), MIKE = userId("mike@beacon.test");
const CLIENT = userId("client@beacon.test"), AGENT = userId("agent@beacon.test");
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id = ${CLIENT}`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
sql(`update public.users set company_id = ${company} where id = ${CLIENT}`);
const appt = (name) => Number(sql(`insert into public.projects (company_id, name, project_type_id, status_id) values (${company}, ${lit(`${TAG} ${name}`)}, (select id from public.project_types where code='APPT'), 1) returning id`));
const P = appt("Seans Appts"), Q = appt("Mikes Appts");
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${P}, ${SEAN}), (${P}, ${AGENT}), (${Q}, ${MIKE})`);
const got = (title, who) => sql(`select count(*) from public.notifications where title = ${lit(title)} and user_id = ${who}`) === "1";

const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 25000) => until(() => page.ev(expr), { timeout });
const setValue = (page, sel, value) => page.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
try {
  section("An administrator: everyone in a role, asked first");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go("/notifications", 8000);
  await when(admin, "!!document.querySelector('[data-composer]')", 30000);
  check("no Link box any more", !(await admin.ev("!!document.querySelector('[data-composer] input[name=link]')")));
  await admin.ev("[...document.querySelectorAll('[data-role-groups] label')].find((l) => /All clients/.test(l.textContent)).click()");
  const T1 = `${TAG} to every client`;
  await setValue(admin, "[data-composer] input[name=title]", T1);
  await admin.ev("document.querySelector('[data-composer-send]').click()");
  check("Send asks first", Boolean(await when(admin, "/Send this to everyone/.test(document.querySelector('[data-confirm-dialog]')?.textContent ?? '') && /all \\d+ clients/.test(document.querySelector('[data-confirm-dialog]').textContent)")));
  await admin.ev("document.querySelector('[data-confirm-cancel]').click()");
  await new Promise((r) => setTimeout(r, 1500));
  check("…Cancel sends nothing", sql(`select count(*) from public.notifications where title = ${lit(T1)}`) === "0");
  await admin.ev("document.querySelector('[data-composer-send]').click()");
  await when(admin, "!!document.querySelector('[data-confirm]')");
  await admin.ev("document.querySelector('[data-confirm]').click()");
  check("…and \"Yes\" sends it", Boolean(await until(() => got(T1, CLIENT) || null, { timeout: 15000 })));

  section("An account manager: their own projects, administrators copied");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go("/notifications", 8000);
  await when(sean, "!!document.querySelector('[data-composer]')", 30000);
  check("no \"All …\" choices, and a word about the copy", !(await sean.ev("!!document.querySelector('[data-role-groups]')")) && (await sean.ev("!!document.querySelector('[data-copy-note]')")));
  const offered = await sean.ev("[...document.querySelectorAll('[data-project-pick] option')].map((o) => o.value).filter(Boolean)");
  check("only the projects they are on", offered.includes(String(P)) && !offered.includes(String(Q)), JSON.stringify(offered));
  await setValue(sean, "[data-project-pick]", P);
  await when(sean, `!!document.querySelector('[data-project-chip="${P}"]')`);
  check("the project's client and reps counted", Number(await sean.ev("document.querySelector('[data-audience]').dataset.audience")) === 2);
  const T2 = `${TAG} for the project`;
  await setValue(sean, "[data-composer] input[name=title]", T2);
  await setValue(sean, "[data-composer] textarea[name=body]", "The list is at https://example.com/list.csv. Lead to call first: /leads/123.");
  await sean.ev("document.querySelector('[data-composer-send]').click()");
  check("sent to the client and the agent on it, no question asked", Boolean(await until(() => (got(T2, CLIENT) && got(T2, AGENT)) || null, { timeout: 15000 })));
  check("…the other manager left out", !got(T2, MIKE));
  const copy = sql(`select body from public.notifications where user_id = ${ADMIN} and title = ${lit(`[Copy] ${T2}`)}`);
  check("an administrator gets a copy, saying who it went to", /^Sent to .+\./.test(copy) && /https:\/\/example\.com\/list\.csv/.test(copy), copy);

  section("The database holds to it");
  const s = await signIn("sean@beacon.test");
  const role = await s.sb.rpc("send_notification", { p_user_ids: [], p_roles: ["client"], p_title: `${TAG} role`, p_body: null });
  check("a manager to everyone in a role: refused", /Only administrators can send to everyone/.test(role.error?.message ?? ""), role.error?.message);
  const other = await s.sb.rpc("send_notification", { p_user_ids: [], p_roles: [], p_title: `${TAG} other`, p_body: null, p_projects: [Q] });
  check("…to a project they aren't on: refused", /projects you are on/.test(other.error?.message ?? ""), other.error?.message);

  section("Links written in the message");
  const N = Number(sql(`select id from public.notifications where title = ${lit(T2)} and user_id = ${AGENT}`));
  const agent = await (await browser.newContext({ as: "agent@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await agent.go(`/notifications/${N}`, 8000);
  const hrefs = await when(agent, "[...document.querySelectorAll('[data-message-link]')].map((a) => a.getAttribute('href')).join(' ') || null", 30000);
  check("a web address and a Lighthouse page, each a link", hrefs.includes("https://example.com/list.csv") && hrefs.includes("/leads/123"), hrefs);

  section("A message on the dashboard's schedule");
  const T3 = `${TAG} with an old link`;
  const a = await signIn("admin@beacon.test");
  await a.sb.rpc("send_notification", { p_user_ids: [SEAN], p_roles: [], p_title: T3, p_body: "See the project", p_link: "/projects/1" });
  const M = Number(sql(`select id from public.notifications where title = ${lit(T3)} and user_id = ${SEAN}`));
  await sean.go("/", 8000);
  const href = await when(sean, `(() => { const i = [...document.querySelectorAll('[data-schedule-item]')].find((x) => x.textContent.includes(${JSON.stringify(T3)})); return i?.querySelector('a')?.getAttribute('href') ?? null; })()`, 30000);
  check("opens the message itself, not its link", href === `/notifications/${M}`, href);
} finally {
  browser.close();
  sql(`delete from public.notifications where title like ${lit(`${TAG}%`)} or title like ${lit(`[Copy] ${TAG}%`)}`);
  sql(`update public.users set company_id = ${clientCompany} where id = ${CLIENT}`);
  sql(`delete from public.project_assignments where project_id in (${P}, ${Q})`);
  sql(`delete from public.projects where id in (${P}, ${Q})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("message rules");
