/** Global search: the Ctrl+K palette. */

import "server-only";
import { clientSlug } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const SEARCH_GROUPS = [
  { key: "leads", label: "Leads", href: (r) => `/leads/${r.id}` },
  { key: "clients", label: "Clients", href: (r) => `/clients/${clientSlug(r.title)}` },
  { key: "projects", label: "Projects", href: (r) => `/projects/${r.id}` },
  { key: "users", label: "Users", href: (r) => `/users?q=${encodeURIComponent(r.email ?? r.title ?? "")}` },
  { key: "documents", label: "Documents", href: (r) => `/documents?q=${encodeURIComponent(r.title ?? "")}` },
  { key: "carriers", label: "Carriers", href: (r) => `/insurance-companies?q=${encodeURIComponent(r.title ?? "")}` },
];

/**
 * Search every record type at once — the global_search() SQL function —
 * and return the non-empty groups with a link per hit.
 */
export async function globalSearch(q, { perGroup = 5 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("global_search", { q, per_group: perGroup });
  if (error) throw error;
  return SEARCH_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: (data?.[g.key] ?? []).map((r) => ({
      id: r.id,
      title: r.title || "—",
      subtitle: r.subtitle || "",
      href: g.href(r),
    })),
  })).filter((g) => g.items.length > 0);
}
