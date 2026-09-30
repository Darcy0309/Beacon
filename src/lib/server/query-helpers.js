/**
 * Building blocks for list queries.
 *
 * List pages fetch one page of rows and the exact total in a single request.
 * Search and facet filters run in the database too, so they see every row and
 * not just the page on screen.
 */

import "server-only";
import { PAGE_SIZE } from "@/lib/paging";

/** Unwrap PostgREST embedded rows that come back as single-element arrays. */
export const one = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** These characters are syntax inside a PostgREST `or` filter. */
const searchTerm = (q) => `%${String(q).replace(/[,()"\\]/g, " ").trim()}%`;

/**
 * Apply search, facet filters and the page window to a query.
 *   search:  columns matched case-insensitively against `q`
 *   table:   set when the search columns live on an embedded resource
 *   columns: facet key -> column path, e.g. { status: "status.code" }
 * Any embed used in a filter must carry `!inner` in the select, otherwise
 * the filter narrows the embed instead of the parent rows.
 */
export function paged(query, { page = 1, perPage = PAGE_SIZE, q = "", filters = {} }, { search = [], table, columns = {} } = {}) {
  if (q && search.length) {
    const term = searchTerm(q);
    query = query.or(search.map((c) => `${c}.ilike.${term}`).join(","), table ? { referencedTable: table } : undefined);
  }
  for (const [key, value] of Object.entries(filters)) {
    if (columns[key] && value) query = query.eq(columns[key], value);
  }
  const from = (page - 1) * perPage;
  return query.range(from, from + perPage - 1);
}

/** Run a paged query; a page past the end (a stale link) falls back to page 1. */
export async function runPaged(build, params) {
  let { data, error, count } = await build(params);
  if (error?.code === "PGRST103" && params.page > 1) {
    ({ data, error, count } = await build({ ...params, page: 1 }));
  }
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

/** `!inner` when a facet filters through this embed, so it narrows the parent rows. */
export const inner = (on) => (on ? "!inner" : "");
