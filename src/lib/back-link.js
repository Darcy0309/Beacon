// Where a lead page's back link goes (Sean, Oct 2026): the list it was
// opened from, with that list's filters, search and page as they were. The
// list passes its own address along as ?from=; only these lists are taken,
// so a link can never send someone off the app. Pure, for pages and tests.

const LISTS = [
  [/^\/explore(?:\?|$)/, "Back to Lead Explorer"],
  [/^\/leads(?:\?|$)/, "Back to leads"],
  [/^\/appointments(?:\?|$)/, "Back to appointments"],
  [/^\/projects\/\d{1,18}(?:\?|$)/, "Back to project"],
  [/^\/clients\/[a-z0-9-]{1,120}(?:\?|$)/, "Back to client"],
  [/^\/qa(?:\?|$)/, "Back to QA"],
];

/** The back link for `from` (a list's address): { href, label }, or null when it is not one of the lists. */
export function backFrom(from) {
  const href = typeof from === "string" ? from.trim() : "";
  if (!href || href.length > 1500 || /[\s\\]/.test(href) || href.startsWith("//")) return null;
  const label = LISTS.find(([re]) => re.test(href))?.[1];
  return label ? { href, label } : null;
}

/**
 * A list's own address, to pass along as ?from=: `path` with the page's
 * searchParams (strings only).
 */
export function listAddress(path, searchParams) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) if (typeof v === "string" && v) params.set(k, v);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** A lead's page, opened from the list at `from` (listAddress()). */
export const leadHref = (id, from) => `/leads/${id}${from ? `?from=${encodeURIComponent(from)}` : ""}`;
