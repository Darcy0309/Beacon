/**
 * The Insurance Companies list (Sean, Nov 2026): under Data & Insights below
 * Reports, without the tiles or the Association filter; searched by name and
 * filtered by state (all of them, or those picked); each carrier with how
 * many states its leads are in (clicked, which), its leads (X-dates) and the
 * clients with it among their Top Carriers; the carriers with leads first,
 * A to Z, then the rest, A to Z; no Association or Status. A carrier's name
 * opens its report: its clients, each one's X-dates with it, to export; its
 * menu still edits it.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/carriers.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CR-E2E ${Date.now()}`;
const carrier = (name) => Number(sql(`insert into public.agencies (name, association) values (${lit(`${TAG} ${name}`)}, 'Regional Carrier') returning id`));
// Added out of order: two with leads, two without.
const ZETA = carrier("Zeta"), ALPHA = carrier("Alpha"), BETA = carrier("Beta"), GAMMA = carrier("Gamma");
const client = (name) => Number(sql(`insert into public.companies (name) values (${lit(`${TAG} ${name}`)}) returning id`));
const project = (company) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} ${company}`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1) returning id`));
const X = client("Rural"), Y = client("Capital");
const PX = project(X), PY = project(Y);
const lead = (p, state, carrierName) => {
  const id = Number(sql(`insert into public.leads (company_name, project_id, state) values (${lit(`${TAG} ${state}`)}, ${p}, ${lit(state)}) returning id`));
  sql(`insert into public.insurance_details (lead_id, wc_carrier) values (${id}, ${lit(`${TAG} ${carrierName}`)})`);
};
// Zeta: Arizona twice and New Mexico, for both clients. Beta: Arizona once.
lead(PX, "AZ", "Zeta");
lead(PY, "NM", "Zeta");
lead(PY, "AZ", "Zeta");
lead(PX, "AZ", "Beta");
// Top Carriers on Project Info: Rural lists Zeta and Gamma, Capital Zeta and Beta.
for (const [p, list] of [[PX, ["Zeta", "Gamma"]], [PY, ["Zeta", "Beta"]]]) {
  sql(`insert into public.project_profiles (project_id, top_carriers) values (${p}, array[${list.map((n) => lit(`${TAG} ${n}`)).join(", ")}])`);
}

const names = (page) => page.ev(`[...document.querySelectorAll('[data-carrier-row]')].map((r) => r.querySelector('[data-carrier-name]')?.textContent.trim().replace(${JSON.stringify(`${TAG} `)}, ''))`);
const figures = (page, id) => page.ev(`(() => { const r = document.querySelector('[data-carrier-row="${id}"]'); if (!r) return null;
  return [r.querySelector('[data-carrier-states]').textContent.trim(), r.querySelector('[data-carrier-xdates]').textContent, r.querySelector('[data-carrier-clients]').textContent]; })()`);
const short = (t) => String(t ?? "").replaceAll(`${TAG} `, "");

const browser = await launchBrowser({ mouse: true });
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("Where it is");
  await admin.go("/insurance-companies", 6000);
  const menu = await admin.ev(`(() => { const out = {}; let group = null;
    for (const el of document.querySelectorAll('[data-nav-group], aside a[href]')) {
      if (el.matches('[data-nav-group]')) { group = el.textContent.trim(); out[group] = []; } else if (group) out[group].push(el.textContent.trim()); }
    return out; })()`);
  const data = menu["Data & Insights"] ?? [];
  check("Insurance Cos. under Data & Insights, right below Reports", data[data.indexOf("Reports") + 1] === "Insurance Cos.", JSON.stringify(data));
  check("…no longer under Accounts", !(menu.Accounts ?? []).includes("Insurance Cos."), JSON.stringify(menu.Accounts));
  check("no tiles along the top", await admin.ev(`!/Widest Footprint|Active X-Dates|high-volume carriers/i.test(document.body.innerText)`));
  check("no Association filter: the search and a State filter", await admin.ev(`!!document.querySelector('[data-multi-facet="states"]') && !document.querySelector('button[aria-pressed]') && !document.querySelector('[data-multi-facet="lines"]')`));
  check("the columns: carrier, states, X-dates, clients — no Association or Status", (await admin.ev(`[...document.querySelectorAll('thead th')].map((h) => h.textContent).join('|')`)).toUpperCase() === "CARRIER|STATES|X-DATES|CLIENTS|ACTION");

  section("The carriers with leads first");
  await admin.fill('input[aria-label="Search carriers…"]', TAG);
  check("searching by name", Boolean(await until(async () => (await admin.url()).includes("q=") && (await names(admin)).length === 4)), JSON.stringify(await names(admin)));
  check("those with leads A to Z, then the rest A to Z", JSON.stringify(await names(admin)) === JSON.stringify(["Beta", "Zeta", "Alpha", "Gamma"]), JSON.stringify(await names(admin)));
  check("a carrier's number of states, its leads, and the clients listing it as a Top Carrier", JSON.stringify(await figures(admin, ZETA)) === JSON.stringify(["2", "3", "2"]), JSON.stringify(await figures(admin, ZETA)));
  check("…another's", JSON.stringify(await figures(admin, BETA)) === JSON.stringify(["1", "1", "1"]), JSON.stringify(await figures(admin, BETA)));
  check("…a client can list a carrier with no leads", JSON.stringify(await figures(admin, GAMMA)) === JSON.stringify(["0", "0", "1"]), JSON.stringify(await figures(admin, GAMMA)));

  section("A carrier's states");
  await admin.mouseClick(`[data-carrier-row="${ZETA}"] [data-carrier-states-open]`);
  const states = await until(() => admin.ev(`[...document.querySelectorAll('[data-carrier-states-list] [data-state]')].map((s) => s.innerText.replace(/\\s+/g, ' ').trim())`).then((x) => x?.length && x));
  check("clicking the number lists the states, each with its leads", JSON.stringify(states) === JSON.stringify(["AZ 2", "NM 1"]), JSON.stringify(states));
  await admin.key("Escape");

  section("By state");
  await admin.mouseClick('[data-multi-facet="states"] button');
  await until(() => admin.ev(`!!document.querySelector('[data-multi-facet-list="states"]')`));
  const list = await admin.ev(`(() => { const l = document.querySelector('[data-multi-facet-list="states"]'); const o = [...l.querySelectorAll('[role=option]')];
    return { first: o[0].textContent.trim(), allOn: o[0].getAttribute('aria-selected'), states: o.length - 1 }; })()`);
  check("every state to pick from, “All states” first and ticked", list.first === "All states" && list.allOn === "true" && list.states === 51, JSON.stringify(list));
  await admin.ev(`document.querySelector('[data-multi-facet-list="states"] [data-option="NM"]').click()`);
  check("New Mexico picked", Boolean(await until(async () => (await admin.url()).includes("states=NM") && JSON.stringify(await names(admin)) === JSON.stringify(["Zeta"]))), JSON.stringify([await admin.url(), await names(admin)]));
  check("…only the carriers with leads there, counted there", JSON.stringify(await figures(admin, ZETA)) === JSON.stringify(["1", "1", "2"]), JSON.stringify(await figures(admin, ZETA)));
  await admin.ev(`document.querySelector('[data-multi-facet-list="states"] [data-option="AZ"]').click()`);
  check("…and Arizona with it", Boolean(await until(async () => (await admin.url()).includes("states=AZ%2CNM") && (await figures(admin, ZETA))?.[1] === "3")), JSON.stringify([await admin.url(), await figures(admin, ZETA)]));
  await admin.ev(`document.querySelector('[data-multi-facet-list="states"] [data-option-all]').click()`);
  check("“All states” clears them", Boolean(await until(async () => !(await admin.url()).includes("states=") && (await names(admin)).length === 4)), JSON.stringify([await admin.url(), await names(admin)]));

  section("A carrier's report");
  await admin.ev(`document.querySelector('[data-carrier-row="${ZETA}"] [data-carrier-link]').click()`);
  check("its name opens it", Boolean(await until(async () => (await admin.path()) === `/insurance-companies/${ZETA}` && admin.ev("!!document.querySelector('[data-carrier-clients-card]')"), { timeout: 20000 })), await admin.url());
  const clientRows = () => admin.ev(`[...document.querySelectorAll('[data-carrier-client]')].map((r) => [...r.cells].map((c) => c.textContent.trim()))`);
  const rowsOf = (all) => (all ?? []).map((r) => [short(r[0]), short(r[1]), r[2], r[3]]);
  check("the clients listing it as a Top Carrier, each with the projects saying so, their states and X-dates",
    JSON.stringify(rowsOf(await clientRows())) === JSON.stringify([["Capital", String(Y), "AZ, NM", "2"], ["Rural", String(X), "AZ", "1"]]), JSON.stringify(rowsOf(await clientRows())));
  await admin.ev(`document.querySelector('[data-carrier-client="${Y}"] [data-carrier-client-xdates]').click()`);
  check("a client's X-dates open its list", Boolean(await until(async () => (await admin.url()).includes(`client=${Y}`) && admin.ev(`document.querySelectorAll('[data-carrier-lead]').length === 2`), { timeout: 15000 })), await admin.url());
  const leadRow = await admin.ev(`[...document.querySelector('[data-carrier-lead]').cells].map((c) => c.textContent.trim())`);
  check("…each the business, where, its phone, project, renewal, the lines with this carrier, when created", /^(AZ|NM)$/.test(short(leadRow?.[0])) && short(leadRow[3]) === String(Y) && leadRow[5] === "Workers comp" && /^\w{3} \d{1,2}, \d{4}$/.test(leadRow[6]), JSON.stringify(leadRow));
  await admin.ev(`window.__csv = null; const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return make(b); };
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) return; return click.call(this); };`);
  await admin.click("[data-export-carrier-xdates]");
  const csv = ((await until(() => admin.ev("window.__csv"))) ?? "").replace(/^\uFEFF/, "").split(/\r\n/);
  check("…to export", csv[0] === "Business,City,ST,Zip,Phone,Project,Renewal,Workers comp XDate,Workers comp Carrier,Date Lead Created" && csv.filter(Boolean).length === 3 && csv.slice(1).filter(Boolean).every((l) => l.includes(`${TAG} Zeta`)), JSON.stringify(csv));
  await admin.go(`/insurance-companies/${ZETA}?states=NM`, 5000);
  check("the states picked on the list carry through", JSON.stringify((await clientRows()).map((r) => r[3])) === JSON.stringify(["1", "0"]), JSON.stringify(await clientRows()));

  section("Its menu edits it");
  await admin.go(`/insurance-companies?q=${encodeURIComponent(TAG)}`, 5000);
  await admin.pointer(`button[aria-label="Actions for ${TAG} Zeta"]`);
  await until(() => admin.ev("!!document.querySelector('[role=menuitem]')"));
  check("Edit from the row's menu", await admin.menuItem("Edit") && Boolean(await until(() => admin.ev(`document.querySelector('[role=dialog] input[name="name"]')?.value === ${JSON.stringify(`${TAG} Zeta`)}`))));
  await admin.key("Escape");

  section("Administrators only");
  const manager = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1400, height: 900 });
  await manager.go("/insurance-companies", 5000);
  check("a manager can't open it", !(await manager.ev("!!document.querySelector('[data-carrier-row]')")) && /don.t have access|not found/i.test(await manager.text()));
} finally {
  browser.close();
  const like = lit(`${TAG}%`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.project_profiles where project_id in (${PX}, ${PY})`);
  sql(`delete from public.projects where id in (${PX}, ${PY})`);
  sql(`delete from public.companies where id in (${X}, ${Y})`);
  sql(`delete from public.agencies where id in (${ZETA}, ${ALPHA}, ${BETA}, ${GAMMA})`);
}

finish("carriers");
