#!/usr/bin/env node
/**
 * Bundles every migration, in order, plus the seed into supabase/deploy.sql:
 * one file to paste into a new hosted project's SQL Editor. A project that is
 * already set up only needs the migrations it has not run yet.
 *
 *   npm run db:bundle
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const at = (p) => new URL(`../${p}`, import.meta.url);

const files = [
  ...readdirSync(at("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => `supabase/migrations/${f}`),
  "supabase/seed.sql",
];

let out = `-- Lighthouse CRM — full database setup for a hosted Supabase project.
-- Generated from supabase/migrations/* + supabase/seed.sql by \`npm run db:bundle\`. Run once in the SQL Editor.
-- Safe to re-run? No — creates tables; drop them first if repeating.

`;
for (const f of files) out += `-- ===== ${f} =====\n${readFileSync(at(f), "utf8")}\n`;

writeFileSync(at("supabase/deploy.sql"), out);
console.log(`Wrote supabase/deploy.sql from ${files.length} files.`);
