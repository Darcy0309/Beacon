/**
 * Direct SQL against the local database, as the postgres superuser — for
 * setting up state and checking what the app actually wrote. Runs psql inside
 * the Supabase CLI's database container, so nothing else needs installing.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ROOT } from "./env.mjs";

const projectId = readFileSync(`${ROOT}/supabase/config.toml`, "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
const CONTAINER = `supabase_db_${projectId}`;

/** Run one statement; returns psql's unaligned output (one row per line). */
export function sql(query) {
  return execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-qtA", "-c", query], {
    encoding: "utf8",
  }).trim();
}

/** Quote a value as an SQL string literal. */
export const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
