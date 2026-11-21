/** Campaign Types (Sean, Nov 2026): the lead sheet layouts, and a lead's. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Every campaign type, by name: [{ id, name, fields, clients }] (how many clients have it). Empty before migration
 * 20270301 has run on a database, so the pages that list them still open.
 */
export async function getCampaignTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaign_types").select("id, name, fields, companies(count)").order("name");
  if (error) {
    console.error("[campaign types]", error.message);
    return [];
  }
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, fields: t.fields ?? {}, clients: Number(t.companies?.[0]?.count ?? 0) }));
}

/**
 * A lead's campaign type (its client's; null: Insurance) and its answers to the type's own fields:
 * { type: { id, name, fields } | null, custom: {} }. Insurance and no answers when the database has neither yet.
 */
export async function getLeadCampaign(leadId) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads")
    .select("custom, project:projects!leads_project_id_fkey(company:companies(campaign_type:campaign_types(id, name, fields)))")
    .eq("id", leadId).maybeSingle();
  if (error) return { type: null, custom: {} };
  const one = (v) => (Array.isArray(v) ? v[0] : v) ?? null;
  return { type: one(one(one(data?.project)?.company)?.campaign_type), custom: data?.custom ?? {} };
}
