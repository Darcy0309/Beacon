/**
 * Pay in the browser: an administrator widens a rate range in Settings and
 * the project rate list follows; sets an account manager to hybrid pay at an
 * hourly rate (one outside the range is refused beside the field); the
 * account manager's clicks and calls are counted as time worked; Pay & Hours
 * shows the pay due, everyone's for an administrator and only their own for
 * the account manager, with a CSV ending in a Total row; and the production
 * CSV comes as totals by client.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const STARTED = sql("select now()");
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const RACHEL = userId("rachel@beacon.test");
const LEAD = Number(sql(`select l.id from public.leads l where l.phone is not null order by l.id limit 1`));

const browser = await launchBrowser();
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);
const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

try {
  section("Settings › Pay & time: ranges an administrator can widen");
  {
    await admin.go("/settings", 4000);
    const value = (name) => admin.ev(`document.querySelector('[data-pay-rules] input[name="${name}"]')?.value ?? null`);
    check("lead pay $8–$12 in 50¢ steps to start with", (await value("lead_min")) === "8.00" && (await value("lead_max")) === "12.00" && (await value("lead_step")) === "0.50",
      `${await value("lead_min")}–${await value("lead_max")} / ${await value("lead_step")}`);
    check("hourly $15.15–$25", (await value("hourly_min")) === "15.15" && (await value("hourly_max")) === "25.00");
    check("the timer stops after 5 idle minutes", (await value("idle_minutes")) === "5");
    await admin.fill('[data-pay-rules] input[name="lead_max"]', "13");
    await admin.ev(`document.querySelector('[data-pay-rules]').requestSubmit()`);
    check("saved", /saved/i.test((await admin.waitToast(/Pay and time rules saved|could not|fix/i)) ?? ""), await admin.toasts());
    check("the wider range is stored", await until(() => sql("select value->'lead'->>'max' from public.app_settings where key='pay_rates'") === "13"));
    await shot(admin, "pay-settings");

    await admin.go("/reports/production#rates", 4000);
    await admin.click("tr[data-project] button", "Set rates");
    await until(() => admin.ev("!!document.querySelector('select[name=lead_rate]')"));
    const leads = await admin.ev("[...document.querySelectorAll('select[name=lead_rate] option')].map((o) => o.value)");
    check("a project's lead rate list now reaches $13", leads.includes("12.50") && leads.includes("13.00"), leads.join(" "));
    const special = await admin.ev("[...document.querySelectorAll('select[name=confirmation_rate] option')].map((o) => o.textContent)");
    check("special pay is picked from $5–$20", special.includes("$5.00") && special.includes("$20.00") && special[0].includes("not paid"), special.join(" "));
    await admin.key("Escape");
  }

  section("An account manager on hybrid pay");
  {
    await admin.go(`/users?q=${encodeURIComponent("rachel@beacon.test")}`, 4000);
    await admin.pointer('button[aria-label="Actions for Rachel Colestock"]');
    await sleep(500);
    await admin.menuItem("Edit");
    await until(() => admin.ev("!!document.querySelector('select[name=pay_model]')"));
    await admin.fill("select[name=pay_model]", "hybrid");
    await until(() => admin.ev("!!document.querySelector('input[name=hourly_rate]')"));
    await admin.fill("input[name=hourly_rate]", "30");
    await admin.ev(`document.querySelector('input[name="email"]').form.requestSubmit()`);
    const refused = await until(() => admin.ev("document.querySelector('input[name=hourly_rate]')?.closest('div')?.parentElement?.innerText ?? ''").then((t) => /between \$15\.15 and \$25\.00/.test(t) && t));
    check("$30 an hour is refused beside the field", Boolean(refused), String(refused));
    await admin.fill("input[name=hourly_rate]", "16");
    await admin.ev(`document.querySelector('input[name="email"]').form.requestSubmit()`);
    await admin.waitToast(/User updated/);
    check("Rachel is on hybrid pay at $16/hr", await until(() => sql(`select pay_model || '/' || hourly_rate from public.pay_profiles where user_id=${RACHEL}`) === "hybrid/16.00"),
      sql(`select pay_model || '/' || hourly_rate from public.pay_profiles where user_id=${RACHEL}`));
    check("the users list says so", await until(async () => /Hybrid · \$16\.00\/hr/.test((await admin.ev(`document.querySelector('[data-pay="${RACHEL}"]')?.textContent ?? ''`)) ?? "")));
  }

  section("Time worked: clicks and calls, not a page left open");
  const rachel = await (await browser.newContext({ as: "rachel@beacon.test" })).newPage({ width: 1440, height: 1000 });
  {
    await rachel.go("/", 4000);
    const idle = Number(sql(`select count(*) from public.work_activity where user_id=${RACHEL} and at >= ${lit(STARTED)}`));
    check("opening a page and waiting counts nothing", idle === 0, `${idle} rows`);
    // A key press anywhere (Escape: harmless) is an action, like a click.
    await rachel.key("Escape");
    check("an action counts", await until(() => Number(sql(`select count(*) from public.work_activity where user_id=${RACHEL} and kind='use' and at >= ${lit(STARTED)}`)) === 1));
    await rachel.go(`/leads/${LEAD}`, 4000);
    // The phone link is a tel: link; stop the browser following it, then press it.
    await rachel.ev(`document.addEventListener('click', (e) => { if (e.target.closest('a[href^="tel:"]')) e.preventDefault(); })`);
    await rachel.mouseClick(`a[href^="tel:"][data-lead-id="${LEAD}"]`);
    check("pressing Call now records the call and the name", await until(() => Number(sql(`select count(*) from public.work_activity where user_id=${RACHEL} and kind='call' and lead_id=${LEAD} and at >= ${lit(STARTED)}`)) === 1));
  }

  section("Pay & Hours");
  {
    await admin.go("/reports/pay", 4000);
    const row = await admin.ev(`[...document.querySelectorAll('tr[data-person="${RACHEL}"] td')].map((td) => td.innerText.trim())`);
    check("Rachel's row: hybrid at $16/hr, with her time today", row[1]?.includes("Hybrid · $16.00/hr") && /\dm|\dh/.test(row[2] ?? ""), JSON.stringify(row));
    check("the rules are spelled out", /stops after 5 minutes/.test(await admin.ev(`document.querySelector('[data-rules]')?.textContent ?? ''`)));
    await admin.click(`tr[data-person="${RACHEL}"] a`, "Rachel");
    check("her days open, hour by hour", await until(() => admin.ev(`!!document.querySelector('[data-days="${RACHEL}"] tr[data-day]')`)));
    await shot(admin, "pay-report");
    const csv = await admin.ev("fetch(document.querySelector('[data-export=people]').getAttribute('href')).then((r) => r.text())");
    const lines = csv.trim().split(/\r?\n/);
    check("the CSV: a row a person and a Total", lines[0].includes("Pay due (USD)") && lines.at(-1).startsWith("Total") && lines.some((l) => l.includes("Rachel Colestock,rachel@beacon.test,Hybrid,16.00")),
      `${lines[0]} … ${lines.at(-1)}`);

    await rachel.go("/reports/pay", 4000);
    const theirs = await rachel.ev("[...document.querySelectorAll('tr[data-person]')].map((r) => Number(r.dataset.person))");
    check("Rachel sees only her own pay", JSON.stringify(theirs) === JSON.stringify([RACHEL]), JSON.stringify(theirs));
    check("…and her own days", await rachel.ev(`!!document.querySelector('[data-days="${RACHEL}"]')`));
  }

  section("Production totals by client");
  {
    const csv = await admin.ev("fetch('/api/reports/production?period=month&by=client').then((r) => r.text())");
    const lines = csv.trim().split(/\r?\n/);
    check("by client: the client, its pay by kind, and a Total row",
      lines[0].replace(/^﻿/, "") === "Client,Calls,Leads,Appointments,Confirmations,Chargebacks,Lead pay (USD),Appointment pay (USD),Special pay (USD),Chargebacks (USD),Total pay (USD)"
      && (lines.length === 1 || lines.at(-1).startsWith("Total")), `${lines[0]} … ${lines.at(-1)}`);
  }
} finally {
  browser.close();
  sql("delete from public.app_settings where key in ('pay_rates', 'time_tracking')");
  sql(`delete from public.pay_profiles where user_id = ${RACHEL}`);
  sql(`delete from public.work_activity where user_id = ${RACHEL} and at >= ${lit(STARTED)}`);
}

finish("pay");
