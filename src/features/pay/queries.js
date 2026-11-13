/** Pay rules, how each person is paid, time worked and pay for a period. */

import "server-only";
import { cache } from "react";
import { fullName } from "@/lib/format";
import { periodView } from "@/lib/pay";
import { createClient } from "@/lib/supabase/server";

const n = (v) => Number(v ?? 0);

/**
 * The pay and time rules (pay_rules(): Settings, with the defaults for
 * anything not set yet). Read once per request.
 */
export const getPayRules = cache(async function getPayRules() {
  const supabase = await createClient();
  const [{ data, error }, { data: periods }] = await Promise.all([
    supabase.rpc("pay_rules"),
    // The pay period schedule (Settings), for a "Custom schedule" pay period; staff read it.
    supabase.from("pay_periods").select("id, starts_on, ends_on, pay_date, closed_dates, closed_label, optional_dates, optional_label").order("starts_on"),
  ]);
  if (error) throw error;
  const range = (r) => ({ min: n(r?.min), max: n(r?.max), step: n(r?.step) || 1 });
  return {
    rates: {
      lead: range(data?.rates?.lead),
      appointment: range(data?.rates?.appointment),
      special: range(data?.rates?.special),
      hourly: range(data?.rates?.hourly),
    },
    time: {
      idle_minutes: n(data?.time?.idle_minutes),
      call_minutes: n(data?.time?.call_minutes),
      rounding: data?.time?.rounding ?? "hour_up",
      round_to: n(data?.time?.round_to) || 15,
      pay_period: data?.time?.pay_period ?? "weekly",
      period_start: data?.time?.period_start ?? "2026-10-05",
      schedule: (periods ?? []).map(periodView),
    },
  };
});

/** How each person is paid, by user id (administrators see everyone's; anyone else only their own). */
export async function getPayProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pay_profiles").select("user_id, pay_model, hourly_rate, appointment_rate, confirmation_rate, bonus_plan");
  if (error) throw error;
  const money = (v) => (v == null ? null : n(v));
  return new Map((data ?? []).map((p) => [p.user_id, {
    model: p.pay_model, rate: money(p.hourly_rate),
    // Their own appointment and confirmation rates, and their bonus plan (Sean, Nov 2026).
    apptRate: money(p.appointment_rate), confRate: money(p.confirmation_rate), plan: p.bonus_plan ?? null,
  }]));
}

/**
 * Pay for a period, one row a person (pay_report()): time worked and paid,
 * hourly pay, commission (lead, appointment and confirmation pay, less
 * chargebacks), Special Pay (a DB dev project's lead goal hit; with the
 * commission, what a hybrid's hours are weighed against), and what they are
 * due. Everyone but an administrator gets only their own row.
 */
export async function getPayReport({ from, to, userId = null }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pay_report", { p_from: from, p_to: to, p_user: userId });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const paidMinutes = n(r.paid_minutes);
    const pay = n(r.pay);
    // Hourly pay applies to hybrid pay only; a rate kept on a commission profile earns nothing.
    const hourlyPay = r.pay_model === "hybrid" ? n(r.hourly_pay) : 0;
    const specialPay = n(r.special_goal_pay);
    // Dec Sheet Pay, Lead-Corrected and Special Pay requests (Sean, Nov 2026): pay events too, shown on their own.
    const decSheetPay = n(r.dec_sheet_pay);
    const correctedPay = n(r.corrected_pay);
    const requestPay = n(r.request_pay);
    const extras = Math.round((decSheetPay + correctedPay + requestPay) * 100) / 100;
    return {
      id: r.user_id,
      name: fullName(r) || r.email,
      email: r.email,
      role: r.role,
      model: r.pay_model,
      rate: r.hourly_rate == null ? null : n(r.hourly_rate),
      workedMinutes: n(r.worked_minutes),
      paidMinutes,
      hourlyPay,
      // Every pay event in the period is the commission side; Special Pay is shown on its own.
      commission: Math.round((n(r.commission) - specialPay - extras) * 100) / 100,
      specialPay,
      extras,
      decSheets: n(r.dec_sheets),
      decSheetPay,
      corrected: n(r.corrected),
      correctedPay,
      requests: n(r.requests),
      requestPay,
      // Bonuses paid in the period (pay_bonuses()), on top of the pay; and their plan.
      bonus: n(r.bonus),
      plan: r.bonus_plan ?? null,
      specials: n(r.specials),
      pay,
      // Which side of a hybrid won, for the report to say so.
      paidBy: r.pay_model === "hybrid" && hourlyPay > n(r.commission) ? "hourly" : "commission",
      perHour: paidMinutes ? pay / (paidMinutes / 60) : null,
      calls: n(r.calls),
      leads: n(r.leads),
      appointments: n(r.appointments),
      confirmations: n(r.confirmations),
      chargebacks: n(r.chargebacks),
    };
  });
}

/** One person's days in a period (work_days()): minutes worked, minutes paid, and each hour's minutes. */
export async function getWorkDays({ from, to, userId }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("work_days", { p_from: from, p_to: to, p_user: userId });
  if (error) throw error;
  return (data ?? [])
    .filter((d) => d.user_id === userId)
    .map((d) => ({ day: d.day, worked: n(d.worked), paid: n(d.paid), hours: (d.hours ?? []).map((h) => ({ hour: n(h.hour), minutes: n(h.minutes), paid: n(h.paid) })) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * A lead's Special Pay requests (Sean, Nov 2026) its viewer may see (their own, those sent to them to
 * decide, or every one for an administrator), newest first; `canDecide`: theirs to approve or decline.
 */
export async function getLeadSpecialPay(leadId, me) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("special_pay_requests")
    .select(`id, amount, approved_amount, reason, status, decision_note, created_at, user_id, decider_id,
      asker:users!special_pay_requests_user_id_fkey(first_name, last_name, email),
      decider:users!special_pay_requests_decider_id_fkey(first_name, last_name, email),
      decided:users!special_pay_requests_decided_by_fkey(first_name, last_name, email)`)
    .eq("lead_id", Number(leadId))
    .order("created_at", { ascending: false });
  if (error) throw error;
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const name = (u) => (u ? fullName(u) || u.email : null);
  return (data ?? []).map((q) => ({
    id: q.id,
    amount: n(q.amount),
    approvedAmount: q.approved_amount == null ? null : n(q.approved_amount),
    reason: q.reason,
    status: q.status,
    note: q.decision_note,
    at: q.created_at,
    by: name(one(q.asker)) ?? "A manager",
    decider: name(one(q.decider)) ?? "the administrators",
    decidedBy: name(one(q.decided)),
    canDecide: q.status === "pending" && (me?.role === "admin" || (q.decider_id === me?.id && q.user_id !== me?.id)),
  }));
}

/** The bonus plans (bonus_rules(): Settings, with the defaults for any not set). */
export async function getBonusRules() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bonus_rules");
  if (error) throw error;
  return data;
}

/** The bonuses paid in the pay periods ending p_from..p_to (pay_bonuses()), each with its days and count. */
export async function getPayBonuses({ from, to, userId = null }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pay_bonuses", { p_from: from, p_to: to, p_user: userId });
  if (error) throw error;
  return (data ?? []).map((b) => ({
    userId: b.user_id, plan: b.plan, label: b.label, from: b.from_day, to: b.to_day,
    counted: n(b.counted), amount: n(b.amount), paidFrom: b.paid_from, paidTo: b.paid_to,
  }));
}
