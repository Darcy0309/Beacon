#!/usr/bin/env node
/**
 * Runs test files one after another and reports one verdict.
 *
 *   node tests/run.mjs unit                  every tests/unit/*.test.mjs
 *   node tests/run.mjs integration e2e       several suites, in order
 *   node tests/run.mjs tests/e2e/security.test.mjs
 *
 * Sequential on purpose: the integration and end-to-end suites share one
 * local database and one running app.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["unit"];

const files = targets.flatMap((target) => {
  const dir = path.join(here, target);
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    return readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort().map((f) => path.join(dir, f));
  }
  if (existsSync(target)) return [path.resolve(target)];
  console.error(`No test suite or file called "${target}".`);
  process.exit(2);
});

const results = [];
for (const file of files) {
  const name = path.relative(root, file);
  console.log(`\n▶ ${name}`);
  const started = Date.now();
  const { status } = spawnSync(process.execPath, [file], { stdio: "inherit", cwd: root });
  results.push({ name, ok: status === 0, secs: ((Date.now() - started) / 1000).toFixed(1) });
}

console.log("\n── summary");
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}  ${r.secs}s`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} file(s) failed.` : `\nAll ${results.length} file(s) passed.`);
process.exit(failed ? 1 : 0);
