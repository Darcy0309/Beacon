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
  const { data, error } = await supabase.from("pay_profiles").select("user_id, pay_model, hourly_rate");
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.user_id, { model: p.pay_model, rate: p.hourly_rate == null ? null : n(p.hourly_rate) }]));
}

/**
 * Pay for a period, one row a person (pay_report()): time worked and paid,
 * hourly pay, commission, and what they are due. Everyone but an
 * administrator gets only their own row.
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
      commission: n(r.commission),
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
