/** A client's removal list, for its page. */

import "server-only";
import { dateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { reasonLabel } from "@/lib/dedupe";

/**
 * The latest names on a client's removal list (`limit` of them), and how many
 * there are for each reason.
 */
export async function listClientRemovals(companyId, { limit = 200 } = {}) {
  const supabase = await createClient();
  const count = (reason) => supabase.from("client_removals").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("reason", reason);
  const [{ data }, ...counts] = await Promise.all([
    supabase.from("client_removals")
      .select("id, reason, source, company_name, contact_name, phone, city, state, note, created_at, lead_id, by:users(first_name, last_name)")
      .eq("company_id", companyId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit),
    count("deletion"), count("dont_call"), count("current_customer"),
  ]);
  const [deletion, dontCall, customer] = counts.map((c) => c.count ?? 0);
  return {
    totals: { deletion, dont_call: dontCall, current_customer: customer, all: deletion + dontCall + customer },
    rows: (data ?? []).map((r) => {
      const by = Array.isArray(r.by) ? r.by[0] : r.by;
      return {
        id: r.id,
        company: r.company_name,
        contact: r.contact_name,
        place: [r.city, r.state].filter(Boolean).join(", "),
        phone: r.phone,
        reason: reasonLabel(r.reason),
        reasonCode: r.reason,
        why: r.source === "import" ? r.note ?? "Duplicate left off an import" : r.note,
        by: by ? [by.first_name, by.last_name].filter(Boolean).join(" ") : null,
        date: dateTime(r.created_at),
        leadId: r.lead_id,
      };
    }),
  };
}
