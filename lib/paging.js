// List pages page, search and filter on the server. The state lives in the
// URL — ?page=2&q=garry&status=hot — so a view is linkable and the back
// button works. These helpers are shared by the server pages that read the
// URL and the client filter bar that writes it.

export const PAGE_SIZE = 50;

/**
 * Read paging and filter state from a page's searchParams. `facetKeys` names
 * the query-string keys that carry facet selections for this table.
 */
export function readListParams(sp, facetKeys = []) {
  const page = Math.max(1, Number.parseInt(sp?.page ?? "1", 10) || 1);
  const q = String(sp?.q ?? "").trim().slice(0, 100);
  const filters = {};
  for (const key of facetKeys) {
    const v = String(sp?.[key] ?? "").trim();
    if (v) filters[key] = v;
  }
  return { page, perPage: PAGE_SIZE, q, filters };
}

/**
 * Everything the pagination footer needs. A page past the end (a stale link)
 * reads as page 1, which is the page the query falls back to.
 */
export function pageInfo(total, page, perPage = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = page >= 1 && page <= pages ? page : 1;
  return {
    page: current,
    pages,
    total,
    from: total ? (current - 1) * perPage + 1 : 0,
    to: Math.min(total, current * perPage),
  };
}
