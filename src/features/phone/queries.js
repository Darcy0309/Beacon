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
      // Their own clock (their account's time zone); null: the business's.
      timeZone: r.time_zone ?? null,
    }))
    .sort((a, b) => (a.userId ? 0 : 1) - (b.userId ? 0 : 1) || b.total - a.total || b.talk - a.talk || a.name.localeCompare(b.name));
}

/**
 * A day's calls by person and half hour (phone_call_times), for Call Activity's chart:
 * [{ userId, slot (minutes past midnight, business time), localSlot (on the person's own clock), calls }]. The people as getCallActivity()'s scope.
 */
export async function getCallTimes(day, { scope = "all", userId = null } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("phone_call_times", { p_day: day, p_scope: scope, p_user: userId });
  if (error) throw error;
  return (data ?? []).map((r) => ({ userId: r.user_id, slot: Number(r.slot), localSlot: Number(r.local_slot ?? r.slot), calls: Number(r.calls) }));
}

/**
 * The Call Log (Sean, Nov 2026): the calls Call Activity counts, one each, newest first (phone_call_log).
 * `user`: an id, "none" (the calls in that rang no one) or null (everyone; a manager gets their own);
 * `kind`: out, in, out_handled, out_cancelled, in_handled, missed or null; `digits`: part of the number;
 * from..to the business's days (null: all time). { rows, total, counts { all, out_handled, … } }.
 */
export async function getCallLog({ from = null, to = null, user = null, kind = null, digits = null, limit = 100, offset = 0 }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("phone_call_log", {
    p_from: from, p_to: to, p_user: user === "none" ? 0 : user, p_kind: kind, p_number: digits, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  const n = (v) => Number(v ?? 0);
  // None of this kind, or past the last page: the counts over the same filters, from any one.
  let first = data?.[0];
  if (!first && (kind || offset)) {
    const { data: any } = await supabase.rpc("phone_call_log", {
      p_from: from, p_to: to, p_user: user === "none" ? 0 : user, p_kind: null, p_number: digits, p_limit: 1, p_offset: 0,
    });
    first = any?.[0] ? { ...any[0], total: 0 } : null;
  }
  return {
    rows: (data ?? []).map((r) => ({
      callSid: r.call_sid,
      userId: r.user_id,
      name: r.user_id ? [r.first_name, r.last_name].filter(Boolean).join(" ") || "—" : null,
      direction: r.direction,
      kind: r.kind,
      number: r.number,
      startedAt: r.started_at,
      talk: n(r.talk_seconds),
      leadId: r.lead_id,
      leadCompany: r.lead_company,
      leadByNumber: Boolean(r.lead_by_number),
      recording: r.recording_sid ? { sid: r.recording_sid, seconds: n(r.recording_seconds) } : null,
    })),
    total: n(first?.total),
    counts: first
      ? { all: n(first.n_all), out_handled: n(first.n_out_handled), out_cancelled: n(first.n_out_cancelled), in_handled: n(first.n_in_handled), missed: n(first.n_missed) }
      : null,
  };
}
