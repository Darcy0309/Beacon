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

/** global_search() for the kinds named; every kind when none are. */
export async function searchRows(q, keys = SEARCH_GROUPS.map((g) => g.key), perGroup = 5) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("global_search", { q, per_group: perGroup, groups: keys });
  if (error) throw error;
  return data;
}

/** global_search()'s rows as the palette's groups, for the kinds a role may open. */
export function shapeGroups(data, groups) {
  return groups
    .map((g) => ({
      key: g.key,
      label: g.label,
      // null: more than shown, not counted (the leads).
      total: data?.[g.key]?.total == null ? null : Number(data[g.key].total),
      items: (data?.[g.key]?.items ?? []).map((r) => ({
        id: r.id,
        title: r.title || "—",
        subtitle: g.subtitle(r) || "",
        href: g.href(r),
      })),
    }))
    .filter((g) => g.items.length > 0);
}
