/**
 * More ways to reach a name, as the client asked: the contact and the
 * decision maker each have a business phone, a mobile and an email, and the
 * lead sheet's contact card puts a Call button beside every number and an
 * Email button beside every address. An extension is dialled after a pause.
 * The new numbers are searchable, and the lead form edits them.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CL-TEST ${Date.now()}`;
const SHOTS = process.env.SHOTS;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const MOBILE = `480-55${String(Date.now()).slice(-1)}-${String(Date.now()).slice(-4)}`;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, contact_name, contact_title, phone, contact_mobile, email,
    decision_maker, dm_title, dm_phone, dm_mobile, dm_email, project_id, assigned_user_id)
  values (${lit(`${TAG} AGSI Business`)}, 'Anna Huff', 'Office Manager', '(214) 269-7488 x203', ${lit(MOBILE)}, 'anna.huff@agsi.test',
    'Robert Huff', 'President', '(214) 269-7400', '(214) 785-2055', 'robert@agsi.test', ${project}, ${SEAN}) returning id`));

const browser = await launchBrowser();
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);
const card = (page) => page.ev(`[...document.querySelectorAll('[data-person]')].map((p) => ({
  who: p.dataset.person, text: p.querySelector('.text-sm')?.innerText ?? '',
  lines: [...p.querySelectorAll('[data-contact-line]')].map((l) => ({ kind: l.dataset.contactLine, value: l.innerText.split('\\n').pop(),
    call: l.querySelector('a[href^="tel:"]')?.getAttribute('href') ?? null, email: l.querySelector('[data-email-to]')?.dataset.emailTo ?? null })) }))`);

try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage();

  section("The contact card");
  await sean.go(`/leads/${lead}`, 4000);
  const people = await card(sean);
  const contact = people.find((p) => p.who === "Contact");
  const dm = people.find((p) => p.who === "Decision maker");
  check("the contact, with name and title", contact?.text.includes("Anna Huff") && contact.text.includes("Office Manager"), JSON.stringify(contact));
  check("…a Call button beside the business number, dialling its extension after a pause",
    contact?.lines.find((l) => l.kind === "Business")?.call === "tel:+12142697488,203", JSON.stringify(contact?.lines));
  check("…beside the mobile", contact?.lines.find((l) => l.kind === "Mobile")?.call === `tel:+1${MOBILE.replace(/\D/g, "")}`);
  check("…and an Email button beside the address", contact?.lines.find((l) => l.kind === "Email")?.email === "anna.huff@agsi.test");
  check("the decision maker, with their own business phone, mobile and email, each with its button",
    dm?.text.includes("Robert Huff") && dm.text.includes("President")
    && dm.lines.find((l) => l.kind === "Business")?.call === "tel:+12142697400"
    && dm.lines.find((l) => l.kind === "Mobile")?.call === "tel:+12147852055"
    && dm.lines.find((l) => l.kind === "Email")?.email === "robert@agsi.test", JSON.stringify(dm));
  check("Call now and Email are still in the header", await sean.ev(`!!document.querySelector('[data-email-lead]') && [...document.querySelectorAll('a[href^="tel:"]')].some((a) => a.textContent.includes('Call now'))`));
  await sean.ev(`document.querySelector('[data-person]').scrollIntoView({ block: 'center' })`);
  await shot(sean, "contact-card");

  section("Calling and emailing from the card");
  const before = Number(sql(`select count(*) from public.work_activity where user_id=${SEAN} and kind='call' and lead_id=${lead}`));
  await sean.ev(`(() => { const a = document.querySelector('[data-person="Decision maker"] [data-contact-line="Mobile"] a'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); })()`);
  check("a Call button counts the call's time for this name, like Call now",
    Boolean(await until(() => Number(sql(`select count(*) from public.work_activity where user_id=${SEAN} and kind='call' and lead_id=${lead}`)) > before)));
  await sean.mouseClick('[data-person="Decision maker"] [data-email-to]');
  const d = await until(() => sean.ev(`(() => { const d = document.querySelector('[role=dialog]'); return d ? { to: d.querySelector('input[name="to"]').value, hi: d.querySelector('textarea[name="body"]').placeholder } : null; })()`));
  check("the decision maker's Email button writes to the decision maker", d?.to === "robert@agsi.test" && d?.hi === "Hi Robert,", JSON.stringify(d));
  await sean.key("Escape");

  section("Searching and editing");
  // The Leads list is the administrator's; account managers work from their call lists.
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  await admin.go(`/leads?q=${encodeURIComponent(MOBILE)}`, 4000);
  check("searching the contact's mobile finds the name", (await admin.text()).includes(`${TAG} AGSI Business`));
  await admin.go(`/leads?q=${encodeURIComponent(MOBILE.replace(/\D/g, ""))}`, 4000);
  check("…typed as bare digits too", (await admin.text()).includes(`${TAG} AGSI Business`));
  await admin.go(`/leads?q=${encodeURIComponent("Robert Huff")}`, 4000);
  check("…and the decision maker's name", (await admin.text()).includes(`${TAG} AGSI Business`));
  const csv = await admin.ev(`fetch('/api/explore/export?q=' + encodeURIComponent(${JSON.stringify(TAG)})).then((r) => r.text())`);
  const [head, row] = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  check("the Lead Explorer's CSV carries them: mobile, and the decision maker's title, phone, mobile and email",
    head.includes("Contact Title,Phone,Mobile,Email,Decision Maker,DM Title,DM Phone,DM Mobile,DM Email")
    && row?.includes("Robert Huff,President,(214) 269-7400,(214) 785-2055,robert@agsi.test") && row.includes(MOBILE), `${head}\n${row}`);
  await sean.go(`/leads/${lead}`, 4000);
  await sean.click("button", "Edit");
  await until(() => sean.ev(`!!document.querySelector('[role=dialog] input[name="dm_mobile"]')`));
  const fields = await sean.ev(`['contact_mobile', 'decision_maker', 'dm_title', 'dm_phone', 'dm_mobile', 'dm_email'].map((n) => document.querySelector('[role=dialog] [name="' + n + '"]')?.value ?? null)`);
  check("the lead form has the new fields, filled in", JSON.stringify(fields) === JSON.stringify([MOBILE, "Robert Huff", "President", "(214) 269-7400", "(214) 785-2055", "robert@agsi.test"]), JSON.stringify(fields));
  await sean.fill('[role=dialog] input[name="dm_mobile"]', "602-555-0177 x9");
  await sean.click("[role=dialog] button[type=submit]");
  check("…and saves them (an extension is fine)", Boolean(await until(() => sql(`select dm_mobile from public.leads where id=${lead}`) === "602-555-0177 x9")));

  section("Someone not on the name");
  const tyler = await (await browser.newContext({ as: "agent@beacon.test" })).newPage();
  await tyler.go(`/leads/${lead}`, 4000);
  const theirs = await card(tyler);
  check("still sees the numbers with Call buttons, but no Email buttons",
    theirs.every((p) => p.lines.filter((l) => l.kind !== "Email").every((l) => l.call)) && theirs.every((p) => p.lines.every((l) => !l.email)), JSON.stringify(theirs));
} finally {
  browser.close();
  sql(`delete from public.work_activity where lead_id = ${lead}`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("contact lines");
