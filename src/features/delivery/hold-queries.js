/** Leads and appointments held in QA (Sean, Oct 2026), read as the signed-in person: Row Level Security decides whose. */

import "server-only";
import { fullName } from "@/lib/format";
import { one } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";
import { readDeliverySettings } from "@/features/delivery/holds";

/**
 * What waits to go to the client, oldest first (an administrator's: every
 * one): held, and held back with their note. With Settings › Delivery, and
 * how many went to clients today (on the business's day: `since`, its start).
 */
export async function getHeldDeliveries({ since }) {
  const supabase = await createClient();
  const [{ data, error }, settings, { data: sent }] = await Promise.all([
    supabase.from("delivery_holds")
      .select(`id, kind, label, status, note, created_at, failed_at, fixed_at, appointment_id,
        lead:leads(id, company_name, city, state),
        project:projects(id, name, company:companies(name)),
        manager:users!delivery_holds_user_id_fkey(first_name, last_name)`)
      .in("status", ["held", "failed", "sending"])
      .order("created_at").order("id").limit(1000),
    readDeliverySettings(supabase),
    supabase.from("lead_deliveries").select("lead_id, result").eq("status", "sent").gte("created_at", since).limit(5000),
  ]);
  if (error) throw error;
  const rows = (data ?? []).map((h) => {
    const lead = one(h.lead);
    const project = one(h.project);
    return {
      id: h.id, kind: h.kind, label: h.label ?? (h.kind === "appointment" ? "Appointment" : "Lead"), status: h.status, note: h.note,
      at: h.created_at, fixedAt: h.fixed_at, leadId: lead?.id ?? null, company: lead?.company_name ?? "—",
      place: [lead?.city, lead?.state].filter(Boolean).join(", "), project: project?.name ?? "—", client: one(project?.company)?.name ?? "—",
      manager: fullName(one(h.manager)) || "—",
    };
  });
  // Each lead or appointment sent once a day, however many addresses it went to.
  const sentToday = new Set((sent ?? []).map((d) => `${d.lead_id}|${d.result}`)).size;
  return { rows, settings, sentToday };
}

/** A lead's own held-back one, for its sheet: what QA said, to fix and mark fixed. Null without one. */
export async function getLeadHold(leadId) {
  const supabase = await createClient();
  const { data } = await supabase.from("delivery_holds")
    .select("id, kind, label, status, note, failed_at").eq("lead_id", Number(leadId)).in("status", ["failed", "held"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}
