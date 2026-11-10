/**
 * Program Funding (client, Nov 2026), in the browser: an administrator sets a
 * project's plan on its form (the client's own example: 200 leads and 50
 * appointments over 6 payments, $7,600), sees its payments on the project's page,
 * marks one paid; the client's page turns its payment reminders on, and one is
 * emailed; the client's Sales Rep (a manager) finds them under Payments Due, and
 * another manager doesn't.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";

const SHOTS = process.env.SHOTS;
const TAG = `PFE-TEST ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const CLIENT = Number(sql("select id from public.users where email='client@beacon.test'"));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id = ${CLIENT}`);
const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Insurance`)}, ${SEAN}) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, bill_lead_rate, bill_appointment_rate, start_date, end_date)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code = 'DBDV'), 1, 15, 75, current_date + 5, current_date + 185) returning id`));
sql(`update public.users set company_id = ${company} where id = ${CLIENT}`);

const mail = await startMailCatcher(2525);
const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });

try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("The plan, on the project's form");
  await admin.go(`/projects/${P}`, 6000);
  check("a Program Funding card, with no plan yet", /No funding plan yet/.test((await when(admin, "document.querySelector('[data-program-funding]')?.innerText")) ?? ""));
  await admin.click("button", "Edit");
  await when(admin, "!!document.querySelector('[data-funding-form]')");
  await admin.fill("[data-funding-plan]", "installments");
  await when(admin, "!!document.querySelector('[data-funding-payments]')");
  await admin.fill("[data-funding-leads]", "200");
  await admin.fill("[data-funding-appts]", "50");
  await admin.ev("document.querySelector('[data-funding-appts-included]').click(), true");
  await admin.fill("[data-funding-setup-fee]", "500");
  await admin.fill("[data-funding-list-fee]", "350");
  await admin.fill("[data-funding-payments]", "6");
  await admin.fill("[data-funding-first-leads]", "50");
  await admin.fill("[data-funding-due-day]", "15");
  const preview = (await when(admin, "document.querySelector('[data-funding-preview]')?.innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("its payments worked out as it is filled in: $7,600, $1,600 first, then $1,200s", /Total \$7,600\.00/.test(preview) && /Payment 1 of 6.*\$1,600\.00/.test(preview) && /Payment 6 of 6.*\$1,200\.00/.test(preview), preview);
  if (SHOTS) await admin.screenshot(`${SHOTS}/funding-form.png`);
  await admin.click("[role=dialog] button[type=submit]", "Save changes");
  check("saved with the project", Boolean(await until(() => sql(`select count(*) from public.project_payments where project_id = ${P}`) === "6" || null, { timeout: 10000 })));

  section("Its payments on the project's page");
  await admin.go(`/projects/${P}`, 6000);
  const totals = (await when(admin, "document.querySelector('[data-funding-totals]')?.innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("the program, billed, paid and still owed", /Program \$7,600\.00/.test(totals) && /Paid \$0\.00/.test(totals) && /Still owed \$7,600\.00/.test(totals), totals);
  check("six payments, the first the first 50 leads with the fees", (await admin.ev("document.querySelectorAll('[data-program-funding] [data-payment]').length")) === 6
    && /50 leads · fees \$850\.00/.test(await admin.ev("document.querySelector('[data-program-funding] [data-payment]').innerText")));
  check("no Remind client while the client's reminders are off", !(await admin.ev("!!document.querySelector('[data-program-funding] [data-payment-remind]')")));
  const first = Number(sql(`select id from public.project_payments where project_id = ${P} and seq = 1`));
  await admin.ev(`document.querySelector('[data-payment-paid="${first}"]').click(), true`);
  check("Mark paid: paid", Boolean(await when(admin, `!!document.querySelector('[data-payment="${first}"] [data-paid]')`)) && sql(`select paid_at is not null from public.project_payments where id = ${first}`) === "t");
  check("…the totals with it", /Paid \$1,600\.00/.test((await when(admin, "(() => { const t = document.querySelector('[data-funding-totals]')?.innerText.replace(/\\s+/g, ' '); return /Paid \\$1,600/.test(t) ? t : null; })()")) ?? ""));
  if (SHOTS) await admin.screenshot(`${SHOTS}/funding-card.png`);

  section("Reminders to the client, turned on on its page");
  const slug = `${TAG} Insurance`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  await admin.go(`/clients/${slug}`, 6000);
  await when(admin, "!!document.querySelector('[data-payment-reminders-switch]')");
  await admin.ev("document.querySelector('[data-payment-reminders-switch]').click(), true");
  check("on, for all its projects", Boolean(await until(() => sql(`select payment_reminders from public.companies where id = ${company}`) === "t" || null, { timeout: 8000 })));
  await admin.go(`/projects/${P}`, 6000);
  const second = Number(sql(`select id from public.project_payments where project_id = ${P} and seq = 2`));
  await when(admin, `!!document.querySelector('[data-payment-remind="${second}"]')`);
  await admin.ev(`document.querySelector('[data-payment-remind="${second}"]').click(), true`);
  // The message's decoded text (its subject encoded, for the "·" in it).
  const email = await until(() => mail.messages.find((m) => m.to.some((t) => t.includes("client@beacon.test")) && /friendly reminder/.test(m.text ?? "")) ?? null, { timeout: 12000 });
  check("Remind client: emailed to the client's people", Boolean(email), JSON.stringify(mail.messages.map((m) => m.to)));
  check("…the amount and the payment in it", /\$1,200\.00/.test(email?.text ?? "") && /Payment 2 of 6/.test(email?.text ?? ""), email?.text);
  check("…and noted", Boolean(await until(() => sql(`select client_reminded_at is not null from public.project_payments where id = ${second}`) === "t" || null, { timeout: 8000 })));

  section("Payments Due, for the client's Sales Rep");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go("/payments", 6000);
  check("in their menu", Boolean(await when(sean, "!!document.querySelector('aside nav a[href=\"/payments\"]')")));
  const due = (await when(sean, `(() => { const t = document.querySelector('[data-payments-page]')?.innerText; return t && t.includes(${JSON.stringify(`${TAG} Insurance`)}) ? t : null; })()`)) ?? "";
  check("their client's payments, the paid one among the paid", due.includes(`${TAG} DBDev`) && Boolean(await sean.ev(`!!document.querySelector('[data-payments-group="paid"] [data-payment="${first}"]')`)));
  const third = Number(sql(`select id from public.project_payments where project_id = ${P} and seq = 3`));
  await sean.ev(`document.querySelector('[data-payment-paid="${third}"]').click(), true`);
  check("…marked paid by the Sales Rep", Boolean(await until(() => sql(`select paid_by from public.project_payments where id = ${third}`) === String(SEAN) || null, { timeout: 8000 })));
  if (SHOTS) await sean.screenshot(`${SHOTS}/payments-due.png`);

  const mike = await (await browser.newContext({ as: "mike@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await mike.go("/payments", 6000);
  await when(mike, "!!document.querySelector('[data-payments-page]')");
  check("another manager: none of them", !(await mike.ev(`document.querySelector('[data-payments-page]').innerText.includes(${JSON.stringify(TAG)})`)));

  section("A payment removed: not owed after all (client, Nov 2026)");
  const fourth = Number(sql(`select id from public.project_payments where project_id = ${P} and seq = 4`));
  await sean.go("/payments", 6000);
  await when(sean, `!!document.querySelector('[data-payment-remove="${fourth}"]')`);
  await sean.ev(`document.querySelector('[data-payment-remove="${fourth}"]').click(), true`);
  const asked = (await when(sean, "document.querySelector('[data-confirm-dialog]')?.innerText")) ?? "";
  check("Remove asks first, saying what happens", /Remove Payment 4 of 6\?/.test(asked) && /\$1,200\.00/.test(asked), asked);
  await sean.ev("document.querySelector('[data-confirm-dialog] [data-confirm]').click(), true");
  check("…removed by the Sales Rep", Boolean(await until(() => sql(`select removed_by from public.project_payments where id = ${fourth}`) === String(SEAN) || null, { timeout: 8000 })));
  check("…off Payments Due", Boolean(await when(sean, `!document.querySelector('[data-payment="${fourth}"]')`)));

  await admin.go(`/projects/${P}`, 6000);
  await when(admin, `!!document.querySelector('[data-payment="${fourth}"][data-payment-removed]')`);
  const owed = (await admin.ev("document.querySelector('[data-funding-totals]').innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("on the project: struck through, out of what's still owed", /Still owed \$3,600\.00/.test(owed) && /1 removed/.test(owed), owed);
  await admin.ev(`document.querySelector('[data-payment-restore="${fourth}"]').click(), true`);
  check("…Put back: owed again", Boolean(await until(() => sql(`select removed_at is null from public.project_payments where id = ${fourth}`) === "t" || null, { timeout: 8000 })));

  section("The client stopped their program");
  await admin.go(`/projects/${P}`, 6000);
  await when(admin, "!!document.querySelector('[data-program-stop]')");
  await admin.ev("document.querySelector('[data-program-stop]').click(), true");
  const stopAsk = (await when(admin, "document.querySelector('[data-confirm-dialog]')?.innerText")) ?? "";
  check("Stop program asks first: the 4 unpaid to be removed", /4 payments not yet paid will be removed/.test(stopAsk), stopAsk);
  await admin.ev("document.querySelector('[data-confirm-dialog] [data-confirm]').click(), true");
  check("…stopped: every unpaid one removed, the paid kept", Boolean(await until(() => sql(`select count(*) filter (where removed_at is not null) || '/' || count(*) filter (where paid_at is not null) from public.project_payments where project_id = ${P}`) === "4/2" || null, { timeout: 8000 })));
  await admin.go(`/projects/${P}`, 6000);
  const stopped = (await when(admin, "document.querySelector('[data-program-stopped]')?.innerText")) ?? "";
  check("…said so on the card, nothing owed", /Program stopped/.test(stopped) && /Still owed \$0\.00/.test(await admin.ev("document.querySelector('[data-funding-totals]').innerText.replace(/\\s+/g, ' ')")), stopped);
  if (SHOTS) await admin.screenshot(`${SHOTS}/funding-stopped.png`);
  await admin.ev("document.querySelector('[data-program-restart]').click(), true");
  check("Start billing again", Boolean(await until(() => sql(`select stopped_at is null from public.project_funding where project_id = ${P}`) === "t" || null, { timeout: 8000 })));

  section("Billed twice a month: the 1st and the 15th");
  await admin.go(`/projects/${P}`, 6000);
  await admin.click("button", "Edit");
  await when(admin, "!!document.querySelector('[data-funding-form]')");
  await admin.fill("[data-funding-plan]", "monthly");
  await when(admin, "!!document.querySelector('[data-funding-billing]')");
  check("billed once a month to begin with, with its due day", (await admin.ev("document.querySelector('[data-funding-billing]').value")) === "monthly" && (await admin.ev("!!document.querySelector('[data-funding-due-day]')")));
  await admin.fill("[data-funding-billing]", "semimonthly");
  const twice = (await when(admin, "(() => { const t = document.querySelector('[data-funding-preview]')?.innerText; return /1st and the 15th/.test(t ?? '') ? t : null; })()")) ?? "";
  check("twice: said so, no due day (due the day billed)", /half month before/.test(twice) && !(await admin.ev("!!document.querySelector('[data-funding-due-day]')")), twice);
  if (SHOTS) await admin.screenshot(`${SHOTS}/funding-twice.png`);
  await admin.click("[role=dialog] button[type=submit]", "Save changes");
  check("saved", Boolean(await until(() => sql(`select plan || '/' || billing from public.project_funding where project_id = ${P}`) === "monthly/semimonthly" || null, { timeout: 10000 })));
  await admin.go(`/projects/${P}`, 6000);
  check("…the card: billed on the 1st & 15th", /billed on the 1st & 15th/.test((await when(admin, "document.querySelector('[data-funding-plan-name]')?.innerText")) ?? ""));

  section("An administrator who is a Sales Rep too: their own clients first");
  const ADMIN = Number(sql("select id from public.users where email='admin@beacon.test'"));
  const own = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Own Co`)}, ${ADMIN}) returning id`));
  const O = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Own project`)}, ${own}, (select id from public.project_types where code = 'DBDV'), 1) returning id`));
  sql(`insert into public.project_payments (project_id, kind, seq, label, due_date, amount) values (${O}, 'installment', 1, 'Payment 1 of 1', current_date + 10, 500)`);
  sql(`update public.project_payments set removed_at = null where project_id = ${P} and seq = 5`);
  try {
    await admin.go("/payments", 6000);
    const page = (await when(admin, `(() => { const t = document.querySelector('[data-payments-page]')?.innerText; return t && t.includes(${JSON.stringify(`${TAG} Own Co`)}) ? t : null; })()`)) ?? "";
    check("My clients: theirs, not Sean's", (await admin.ev("document.querySelector('[data-payments-scope]')?.dataset.paymentsScope")) === "mine"
      && !page.includes(`${TAG} Insurance`), page.slice(0, 300));
    await admin.ev("document.querySelector('[data-payments-scope-pick=\"all\"]').click(), true");
    check("All clients: everyone's", Boolean(await when(admin, `(() => { const t = document.querySelector('[data-payments-page]')?.innerText ?? ''; return t.includes(${JSON.stringify(`${TAG} Insurance`)}) && t.includes(${JSON.stringify(`${TAG} Own Co`)}); })()`)));
    if (SHOTS) { await sleep(2500); await admin.screenshot(`${SHOTS}/payments-all.png`); }
  } finally {
    sql(`delete from public.projects where id = ${O}`);
    sql(`delete from public.companies where id = ${own}`);
  }
} finally {
  browser.close();
  await mail.close?.();
  sql(`update public.users set company_id = ${clientCompany} where id = ${CLIENT}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("program funding");
