/** Global search: the Ctrl+K palette. */

import "server-only";
import { clientSlug } from "@/lib/format";
import { rolesForPath } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

const join = (...parts) => parts.filter(Boolean).join(" · ");

/**
 * The kinds of record the palette finds: where each hit opens, and the line
 * under it. A kind is searched only for roles that can open where it leads,
 * so nobody is offered a result that ends on "You don't have access".
 */
const SEARCH_GROUPS = [
  {
    key: "leads", label: "Leads", sample: "/leads/1",
    href: (r) => `/leads/${r.id}`,
    subtitle: (r) => join(r.contact, r.place, r.client, r.status),
  },
  {
    key: "clients", label: "Clients", sample: "/clients/x",
    href: (r) => `/clients/${clientSlug(r.title)}`,
    subtitle: (r) => join(r.contact, r.place, `${r.projects} project${Number(r.projects) === 1 ? "" : "s"}`),
  },
  {
    key: "projects", label: "Projects", sample: "/projects/1",
    href: (r) => `/projects/${r.id}`,
    subtitle: (r) => join(r.client, r.type, r.status),
  },
  {
    key: "users", label: "Users", sample: "/users",
    href: (r) => `/users?q=${encodeURIComponent(r.email ?? r.title ?? "")}`,
    subtitle: (r) => join(r.email, r.role, r.status === "active" ? null : r.status),
  },
  {
    key: "documents", label: "Documents", sample: "/documents",
    href: (r) => `/documents?q=${encodeURIComponent(r.title ?? "")}`,
    subtitle: (r) => join(r.file_type, r.client),
  },
  {
    key: "carriers", label: "Carriers", sample: "/insurance-companies",
    href: (r) => `/insurance-companies?q=${encodeURIComponent(r.title ?? "")}`,
    subtitle: (r) => r.association ?? "",
  },
];

/** The kinds of record a role may search: those whose pages it can open. */
export const searchGroupsFor = (role) => SEARCH_GROUPS.filter((g) => rolesForPath(g.sample)?.includes(role));

/**
 * Search every kind of record this role can open, at once — global_search()
 * in the database: every word typed must appear; a phone number matches
 * however it is punctuated. Returns the non-empty groups, each with its
 * total and the first few hits.
 */
export async function globalSearch(q, role, { perGroup = 5 } = {}) {
  const groups = searchGroupsFor(role);
  if (!groups.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("global_search", { q, per_group: perGroup, groups: groups.map((g) => g.key) });
  if (error) throw error;
  return groups
    .map((g) => ({
      key: g.key,
      label: g.label,
      total: Number(data?.[g.key]?.total ?? 0),
      items: (data?.[g.key]?.items ?? []).map((r) => ({
        id: r.id,
        title: r.title || "—",
        subtitle: g.subtitle(r) || "",
        href: g.href(r),
      })),
    }))
    .filter((g) => g.items.length > 0);
}
