/** Client feedback on appointments. */

import "server-only";
import { shortDate } from "@/lib/format";
import { one } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

export async function getFeedback() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback")
    .select("*, lead:leads(company_name), nature:nature_of_enquiry(name), fb_status:fb_statuses(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []).map((f) => ({
    id: f.id,
    client: one(f.lead)?.company_name ?? "—",
    contact: f.submitted_by ?? "—",
    rating: f.rating ?? 0,
    date: shortDate(f.created_at),
    text: f.content ?? "",
    status: one(f.fb_status)?.name ?? "Open",
    nature: one(f.nature)?.name ?? "—",
  }));

  const rated = rows.filter((r) => r.rating > 0);
  const avg = rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10 : 0;
  const promoters = rated.length ? Math.round((rated.filter((r) => r.rating >= 4).length / rated.length) * 100) : 0;

  return { feedback: rows, summary: { avg, total: rows.length, promoters } };
}
