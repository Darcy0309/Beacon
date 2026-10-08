#!/usr/bin/env node
/**
 * Guards the contract between each form and its validation schema: every
 * `name="…"` a form submits must be a key in the schema its action validates,
 * otherwise that field is silently unvalidated. Runs without Next or a DB.
 */
import { readFileSync } from "node:fs";
import { schemas } from "../../src/lib/validate.js";

// form component -> schema it must match, plus fields that are legitimately
// outside the schema (hidden ids, files, passthroughs).
const FORMS = {
  "src/features/leads/components/lead-form.jsx":        { schema: "lead",        extra: ["id"] },
  "src/features/projects/components/project-form.jsx":     { schema: "project",     extra: ["id"] },
  "src/features/appointments/components/appointment-form.jsx": { schema: "appointment", extra: ["id", "client_note_known"] },
  "src/features/users/components/user-form.jsx":        { schema: "user",        extra: ["id"] },
  "src/features/bulletin/components/bulletin-composer.jsx":{ schema: "bulletin",    extra: [] },
  "src/features/auth/components/password-form.jsx":    { schema: "password",    extra: [] },
  // Recipients are multi-value, checked in sendNotification rather than the schema.
  "src/features/notifications/components/notification-composer.jsx": { schema: "notification", extra: ["roles", "user_ids"] },
  "src/features/notifications/components/notification-thread.jsx": { schema: "reply",   extra: ["id"] },
  "src/features/work/components/call-result-panel.jsx": { schema: "callResult", extra: [] },
  "src/features/email/components/email-lead.jsx":       { schema: "leadEmail",  extra: [] },
  // The policy lines' fields are named from POLICY_LINES (name={line.date}), so only these are literal.
  "src/features/leads/components/coverage-form.jsx":    { schema: "coverage",   extra: [] },
  "src/features/leads/components/reminder-card.jsx":    { schema: "reminder",   extra: [] },
  "src/features/leads/components/lead-notes.jsx":       { schema: "leadNote",   extra: [] },
  "src/features/insurance/components/carrier-form.jsx": { schema: "carrier",    extra: [] },
  "src/features/pay/components/pay-period-form.jsx":    { schema: "payPeriod",  extra: [] },
  "src/features/imports/components/csv-import.jsx":       { schema: "csvImport",   extra: ["file"] },
  "src/features/settings/components/settings-form.jsx":    { schema: "settings",    extra: [] },
  "src/features/pay/components/pay-rules-form.jsx":        { schema: "payRules",    extra: [] },
  // The three rates are named from RATE_KINDS (name={name}), so only the hidden id is literal here.
  "src/features/projects/components/project-rates-form.jsx": { schema: "projectRates", extra: ["project_id"] },
  "src/features/auth/components/login-form.jsx":       { schema: "login",       extra: ["next", "code"] },  // `code` belongs to the two-factor step
};

let failures = 0;
for (const [file, { schema, extra }] of Object.entries(FORMS)) {
  const src = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
  const names = [...src.matchAll(/\bname=["']([a-z_]+)["']/g)].map((m) => m[1]);
  const allowed = new Set([...Object.keys(schemas[schema]), ...extra]);
  const unvalidated = [...new Set(names)].filter((n) => !allowed.has(n));
  if (unvalidated.length) {
    console.error(`✗ ${file}: fields not in schemas.${schema}: ${unvalidated.join(", ")}`);
    failures++;
  } else {
    console.log(`✓ ${file} → schemas.${schema} (${new Set(names).size} fields)`);
  }
}

// And the reverse: a required schema field that no form ever submits is a bug too.
for (const [file, { schema }] of Object.entries(FORMS)) {
  const src = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
  const names = new Set([...src.matchAll(/\bname=["']([a-z_]+)["']/g)].map((m) => m[1]));
  const required = Object.entries(schemas[schema])
    .filter(([, rules]) => rules.some((r) => r("") !== null)) // fails on empty ⇒ required
    .map(([k]) => k);
  const missing = required.filter((k) => !names.has(k));
  if (missing.length) {
    console.error(`✗ ${file}: required fields never submitted: ${missing.join(", ")}`);
    failures++;
  }
}

console.log(failures ? `\n${failures} contract violation(s).\n` : "\nAll forms match their schemas.\n");
process.exit(failures ? 1 : 0);
