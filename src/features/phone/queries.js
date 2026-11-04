/** Call Activity: the calls made and taken on the phone's Twilio line, by person. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Each person's calls over the business's days from..to (phone_call_report),
 * most calls first: { userId, name, role, total, outHandled, outCancelled,
 * inHandled, missed, talk (seconds), onCall }. The calls in that rang nobody
 * come last, with no userId. Administrators and account managers only.
 */
export async function getCallActivity({ from, to }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("phone_call_report", { p_from: from, p_to: to });
  if (error) throw error;
  const n = (v) => Number(v ?? 0);
  return (data ?? [])
    .map((r) => ({
      userId: r.user_id,
      name: r.user_id ? [r.first_name, r.last_name].filter(Boolean).join(" ") || "—" : "No one online",
      role: r.role,
      total: n(r.total),
      outHandled: n(r.out_handled),
      outCancelled: n(r.out_cancelled),
      inHandled: n(r.in_handled),
      missed: n(r.missed),
      talk: n(r.talk_seconds),
      onCall: Boolean(r.on_call),
    }))
    .sort((a, b) => (a.userId ? 0 : 1) - (b.userId ? 0 : 1) || b.total - a.total || b.talk - a.talk || a.name.localeCompare(b.name));
}
