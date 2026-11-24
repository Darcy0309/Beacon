/**
 * Campaign Types' field formats (Sean, Nov 2026: "make the answer field # value, %, text, drop down with answers like
 * the carrier field we have (where I can import a list of categories)"): a Percent field, a Pick several field (a pick
 * list like the carriers'), and a list's choices loaded from a file. Built in Settings, answered on a lead and in
 * Project Info, and shown.
 *
 *   node tests/run.mjs tests/e2e/campaign-field-formats.test.mjs
 */
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CF${Date.now()}`;
const NAME = `MSP ${TAG}`;
const co = Number(sql(`insert into public.companies (name, status) values (${lit(`${TAG} Tech Partners`)}, 'active') returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} DBDev`)}, ${co},
  (select id from public.project_types where code = 'DBDV'), 1) returning id`));
const LEAD = Number(sql(`insert into public.leads (company_name, project_id, phone) values (${lit(`${TAG} Acme Dental`)}, ${P}, '6025550101') returning id`));
const dir = mkdtempSync(path.join(tmpdir(), "cf-"));
const FILE = path.join(dir, "platforms.csv");
// A spreadsheet's first column, its heading left off; a choice with a comma in it kept whole.
writeFileSync(FILE, 'Name,Notes\nMicrosoft 365,x\n"Google, Workspace",y\nZoom,z\nzoom,dup\n');
const pickIn = (page, scope, choice) => page.ev(`(() => { const box = document.querySelector('${scope} [data-pick-option="${choice}"] input'); box.click(); return box.checked; })()`);

const browser = await launchBrowser();
let typeId = null;
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("Built: a Percent field, and Pick several with its choices from a file");
  await admin.go("/settings/leads", 6000);
  await admin.ev(`document.querySelector('[data-campaign-types]')?.scrollIntoView()`);
  await until(() => admin.ev(`!!document.querySelector('[data-new-campaign-type]')`), { timeout: 20000 });
  await admin.click("[data-new-campaign-type]");
  await until(() => admin.ev(`!!document.querySelector('[data-campaign-type-form]')`));
  await admin.fill("[data-campaign-type-name]", NAME);
  await admin.click('[data-campaign-section="custom"] [data-custom-add]');
  await admin.fill('[data-campaign-section="custom"] [data-custom-field="0"] [data-custom-label]', "Managed share");
  await admin.fill('[data-campaign-section="custom"] [data-custom-field="0"] [data-custom-type]', "percent");
  await admin.click('[data-campaign-section="custom"] [data-custom-add]');
  await admin.fill('[data-campaign-section="custom"] [data-custom-field="1"] [data-custom-label]', "Platforms");
  await admin.fill('[data-campaign-section="custom"] [data-custom-field="1"] [data-custom-type]', "multi");
  const fileInput = '[data-campaign-section="custom"] [data-custom-field="1"] [data-custom-options-file]';
  await until(() => admin.ev(`!!document.querySelector('${fileInput}')`));
  const { root } = await admin.send("DOM.getDocument", { depth: -1, pierce: true });
  const { nodeId } = await admin.send("DOM.querySelector", { nodeId: root.nodeId, selector: fileInput });
  await admin.send("DOM.setFileInputFiles", { nodeId, files: [FILE] });
  const count = await until(() => admin.ev(`(() => { const t = document.querySelector('[data-campaign-section="custom"] [data-custom-field="1"] [data-custom-options-count]')?.textContent ?? ''; return /^3 choices/.test(t) ? t : null; })()`));
  check("loaded from the file: 3 choices (its heading left off, Zoom once, a comma kept)", Boolean(count), count);
  check("…said so", /3 choices added from the file/.test((await admin.waitToast(/added from the file/)) ?? ""));
  await admin.click('[data-campaign-section="info_custom"] [data-custom-add]');
  await admin.fill('[data-campaign-section="info_custom"] [data-custom-field="0"] [data-custom-label]', "Tools they use");
  await admin.fill('[data-campaign-section="info_custom"] [data-custom-field="0"] [data-custom-type]', "multi");
  await until(() => admin.ev(`!!document.querySelector('[data-campaign-section="info_custom"] [data-custom-options]')`));
  await admin.fill('[data-campaign-section="info_custom"] [data-custom-options]', "ConnectWise\nAutotask\nNinjaOne");
  await admin.click("[data-campaign-type-form] button[type=submit]");
  const saved = await until(() => sql(`select fields::text from public.campaign_types where name = ${lit(NAME)}`) || null, { timeout: 15000 });
  typeId = Number(sql(`select id from public.campaign_types where name = ${lit(NAME)}`));
  const f = JSON.parse(saved ?? "{}");
  const [share, platforms] = f.custom ?? [];
  check("saved: Percent, and Pick several with the file's choices", share?.type === "percent" && platforms?.type === "multi"
    && JSON.stringify(platforms.options) === JSON.stringify(["Microsoft 365", "Google, Workspace", "Zoom"]), saved);
  check("…and Project Info's, typed one a line", JSON.stringify(f.info_custom?.[0]?.options) === JSON.stringify(["ConnectWise", "Autotask", "NinjaOne"]), saved);

  section("Answered on a lead");
  sql(`update public.companies set campaign_type_id = ${typeId} where id = ${co}`);
  await admin.go(`/leads/${LEAD}`, 6000);
  await until(() => admin.ev(`!!document.querySelector('[data-edit-business]')`), { timeout: 20000 });
  await admin.click("[data-edit-business]");
  await until(() => admin.ev(`!!document.querySelector('[data-business-form] [data-group="custom"]')`));
  await admin.fill(`[data-business-form] input[name="custom.${share.id}"]`, "12.5%");
  const form = `[data-business-form] [data-custom-input="${platforms.id}"]`;
  await admin.click(`${form} [data-pick-open]`);
  await until(() => admin.ev(`!!document.querySelector('${form} [data-pick-option="Zoom"]')`));
  await pickIn(admin, form, "Google, Workspace");
  await pickIn(admin, form, "Zoom");
  await admin.click("[data-business-form] button[type=submit]");
  const answers = await until(() => { const c = JSON.parse(sql(`select custom::text from public.leads where id = ${LEAD}`) || "{}"); return c[share.id] != null ? c : null; }, { timeout: 15000 });
  check("saved: 12.5 for the percent, both choices as a list", answers?.[share.id] === 12.5 && JSON.stringify(answers?.[platforms.id]) === JSON.stringify(["Google, Workspace", "Zoom"]), JSON.stringify(answers));
  await admin.go(`/leads/${LEAD}`, 6000);
  const shown = await until(() => admin.ev(`[...document.querySelectorAll('[role=tabpanel]')].find((p) => p.offsetParent !== null)?.innerText ?? null`));
  check("shown: 12.5% and the choices", /12\.5%/.test(shown ?? "") && /Google, Workspace, Zoom/.test(shown ?? ""), shown?.slice(0, 400));

  section("Choices taken off");
  await admin.click("[data-edit-business]");
  await until(() => admin.ev(`!!document.querySelector('${form} [data-pick-open]')`));
  await admin.click(`${form} [data-pick-open]`);
  await until(() => admin.ev(`!!document.querySelector('${form} [data-pick-option="Zoom"]')`));
  await pickIn(admin, form, "Google, Workspace");
  await pickIn(admin, form, "Zoom");
  await admin.click("[data-business-form] button[type=submit]");
  check("none chosen: cleared", Boolean(await until(() => !(platforms.id in JSON.parse(sql(`select custom::text from public.leads where id = ${LEAD}`) || "{}")), { timeout: 15000 })),
    sql(`select custom::text from public.leads where id = ${LEAD}`));

  section("In Project Info");
  sql(`insert into public.project_profiles (project_id) values (${P}) on conflict do nothing`);
  await admin.go(`/leads/${LEAD}?tab=info`, 6000);
  await until(() => admin.ev(`!!document.querySelector('[data-edit-project-info]')`), { timeout: 20000 });
  await admin.click("[data-edit-project-info]");
  const info = `[role=dialog] [data-info-custom="${f.info_custom[0].id}"]`;
  await until(() => admin.ev(`!!document.querySelector('${info} [data-pick-open]')`));
  await admin.click(`${info} [data-pick-open]`);
  await until(() => admin.ev(`!!document.querySelector('${info} [data-pick-option="Autotask"]')`));
  await pickIn(admin, info, "Autotask");
  await pickIn(admin, info, "NinjaOne");
  await admin.click("[role=dialog] button[type=submit]");
  const kept = await until(() => { const r = sql(`select custom::text from public.project_profiles where project_id = ${P}`); return r && r !== "{}" ? r : null; }, { timeout: 15000 });
  check("saved both", JSON.stringify(JSON.parse(kept ?? "{}")[f.info_custom[0].id]) === JSON.stringify(["Autotask", "NinjaOne"]), kept);
  await sleep(200);
} finally {
  browser.close();
  rmSync(dir, { recursive: true, force: true });
  sql(`delete from public.leads where id = ${LEAD}`);
  sql(`delete from public.project_profiles where project_id = ${P}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${co}`);
  if (typeId) sql(`delete from public.campaign_types where id = ${typeId}`);
}

finish("campaign field formats");
