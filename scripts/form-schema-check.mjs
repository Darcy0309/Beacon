#!/usr/bin/env node
/**
 * Guards the contract between each form and its validation schema: every
 * `name="…"` a form submits must be a key in the schema its action validates,
 * otherwise that field is silently unvalidated. Runs without Next or a DB.
 */
import { readFileSync } from "node:fs";
import { schemas } from "../lib/validate.js";

// form component -> schema it must match, plus fields that are legitimately
// outside the schema (hidden ids, files, passthroughs).
const FORMS = {
  "components/lead-form.jsx":        { schema: "lead",        extra: ["id"] },
  "components/project-form.jsx":     { schema: "project",     extra: ["id"] },
  "components/appointment-form.jsx": { schema: "appointment", extra: ["id"] },
  "components/user-form.jsx":        { schema: "user",        extra: ["id"] },
  "components/bulletin-composer.jsx":{ schema: "bulletin",    extra: [] },
  "components/call-logger.jsx":      { schema: "call",        extra: [] },
  "components/csv-import.jsx":       { schema: "csvImport",   extra: ["file"] },
  "components/settings-form.jsx":    { schema: "settings",    extra: [] },
  "components/login-form.jsx":       { schema: "login",       extra: ["next", "code"] },  // `code` belongs to the two-factor step
};

let failures = 0;
for (const [file, { schema, extra }] of Object.entries(FORMS)) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
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
  const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
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
