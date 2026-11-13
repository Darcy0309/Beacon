/** Call Activity: the calls made and taken on the phone's Twilio line, by person. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Each person's calls over the business's days from..to (phone_call_report),
 * most calls first: { userId, name, role, total, outHandled, outCancelled,
 * inHandled, missed, talk (seconds), onCall, firstCall (when their first call
 * out started) }. The calls in that rang nobody come last, with no userId.
 * Administrators and account managers only.
 *
 *   scope   "all" (everyone on the phone; a manager asking for it gets "team"),
 *           "team" (the account managers, not administrators or Sales Reps),
 *           "me" (userId's line alone; a manager's own, whatever they give)
 */
export async function getCallActivity({ from, to }, { scope = "all", userId = null } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("phone_call_report", { p_from: from, p_to: to, p_scope: scope, p_user: userId });
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
      firstCall: r.first_call ?? null,
    }))
    .sort((a, b) => (a.userId ? 0 : 1) - (b.userId ? 0 : 1) || b.total - a.total || b.talk - a.talk || a.name.localeCompare(b.name));
}

/**
 * A day's calls by person and half hour (phone_call_times), for Call Activity's chart:
 * [{ userId, slot (minutes past midnight, business time), calls }]. The people as getCallActivity()'s scope.
 */
export async function getCallTimes(day, { scope = "all", userId = null } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("phone_call_times", { p_day: day, p_scope: scope, p_user: userId });
  if (error) throw error;
  return (data ?? []).map((r) => ({ userId: r.user_id, slot: Number(r.slot), calls: Number(r.calls) }));
}
