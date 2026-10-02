/**
 * Building blocks for list queries.
 *
 * List pages fetch one page of rows and the exact total in a single request.
 * Search and facet filters run in the database too, so they see every row and
 * not just the page on screen.
 */

import "server-only";
import { PAGE_SIZE } from "@/lib/paging";
import { searchWords, wordForms } from "@/lib/search-words";

export { searchWords };

/** Unwrap PostgREST embedded rows that come back as single-element arrays. */
export const one = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * Apply search, facet filters and the page window to a query.
 *   search:  columns matched case-insensitively; every word typed must
 *            appear in at least one of them ("Sean Fitzgerald" finds the
 *            first and last name in two columns), a number-like word as
 *            typed or as its digits (see lib/search-words.js)
 *   alsoOr:  more conditions a word may meet instead, as PostgREST filter
 *            strings: alsoOr(word, index) => ["company_id.in.(3,7)"]
 *   table:   set when the search columns live on an embedded resource
 *   columns: facet key -> column path, e.g. { status: "status.code" }
 * Any embed used in a filter must carry `!inner` in the select, otherwise
 * the filter narrows the embed instead of the parent rows.
 */
export function paged(query, { page = 1, perPage = PAGE_SIZE, q = "", filters = {} }, { search = [], alsoOr, table, columns = {} } = {}) {
  if (q && search.length) {
    searchWords(q).forEach((word, i) => {
      // A number-like word matches as typed or as digits ("602.851.8511", "24-7").
      const forms = wordForms(word);
      const any = [...search.flatMap((c) => forms.map((f) => `${c}.ilike.%${f}%`)), ...(alsoOr?.(word, i) ?? [])];
      query = query.or(any.join(","), table ? { referencedTable: table } : undefined);
    });
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

/** The most rows the API returns for one request (max_rows in supabase/config.toml). */
export const API_PAGE = 1000;

/**
 * Every row of a query the API would otherwise cut off at API_PAGE, read a
 * page at a time until a short page comes back. `build(from, to)` returns
 * the query for one window and must order it fully (ties broken by a unique
 * key), or rows can repeat or go missing between pages.
 */
export async function readAll(build, { max = 50000 } = {}) {
  const rows = [];
  for (let from = 0; from < max; from += API_PAGE) {
    const { data, error } = await build(from, from + API_PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < API_PAGE) break;
  }
  return rows;
}

/** `!inner` when a facet filters through this embed, so it narrows the parent rows. */
export const inner = (on) => (on ? "!inner" : "");
