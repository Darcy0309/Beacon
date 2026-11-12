/**
 * Settings → Call Recording (Sean, Nov 2026: "will the phone system record all the calls anyway without
 * the manager having to hit record?"): an administrator turns on "Record every call", with or without
 * "This call may be recorded" said first (off unless chosen: Sean calls no California clients); the notice is greyed while recording every call is off, and
 * its choice kept for when it is turned on again. What the calls then do: tests/integration/call-recordings.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const before = sql("select value::text from public.app_settings where key = 'phone'") || null;
const saved = () => JSON.parse(sql("select coalesce(value::text, 'null') from public.app_settings where key = 'phone'") || "null");
const browser = await launchBrowser();

try {
  sql("delete from public.app_settings where key = 'phone'");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1280, height: 900 });
  await admin.go("/settings", 5000);
  const card = "[data-call-recording-settings]";
  await until(() => admin.ev(`!!document.querySelector('${card}')`));

  section("The card");
  check("off at first: calls are recorded only with Record", (await admin.ev(`document.querySelector('${card} [data-record-all]').checked`)) === false);
  check("…the notice greyed until it is on, unticked to start (Sean: no calls into California)", await admin.ev(`(() => { const n = document.querySelector('${card} [data-record-notice]'); return n.disabled && !n.checked; })()`));
  check("…saying why the notice matters", /California/.test(await admin.ev(`document.querySelector('${card}').innerText`)));

  section("Record every call");
  await admin.ev(`document.querySelector('${card} [data-record-all]').click()`);
  check("ticked: the notice can be chosen", Boolean(await until(() => admin.ev(`!document.querySelector('${card} [data-record-notice]').disabled`))));
  await admin.click(`${card} button[type=submit]`, "Save");
  check("saved: every call, nothing said", Boolean(await until(() => saved()?.record_all === true && saved()?.record_notice === false)), JSON.stringify(saved()));
  check("…and it says so", Boolean(await admin.waitToast(/Call recording saved/)));

  await admin.ev(`document.querySelector('${card} [data-record-notice]').click()`);
  await admin.click(`${card} button[type=submit]`, "Save");
  check("the notice on: every call, with the notice", Boolean(await until(() => saved()?.record_all === true && saved()?.record_notice === true)), JSON.stringify(saved()));

  await admin.go("/settings", 5000);
  await until(() => admin.ev(`!!document.querySelector('${card}')`));
  check("as saved when the page is opened again", await admin.ev(`document.querySelector('${card} [data-record-all]').checked && document.querySelector('${card} [data-record-notice]').checked`));
  await admin.ev(`document.querySelector('${card} [data-record-all]').click()`);
  await admin.click(`${card} button[type=submit]`, "Save");
  check("off again: only with Record, the notice's choice kept for next time", Boolean(await until(() => saved()?.record_all === false && saved()?.record_notice === true)), JSON.stringify(saved()));
  check("…written in the activity log", Number(sql("select count(*) from public.activity_log where action = 'settings.phone' and created_at > now() - interval '5 minutes'")) >= 3);
} finally {
  sql(before ? `insert into public.app_settings (key, value) values ('phone', ${lit(before)}::jsonb) on conflict (key) do update set value = excluded.value`
    : "delete from public.app_settings where key = 'phone'");
  browser.close();
}

finish("call recording settings");
