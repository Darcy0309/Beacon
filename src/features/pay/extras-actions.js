"use server";

/**
 * Pay and bonus additions (Sean, Nov 2026): Dec Sheet Pay, Special Pay requests, a project's dec sheet
 * rate and the bonus plans. The database decides who may do each (supabase/migrations/…_pay_extras.sql).
 */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, idFrom, logActivity, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";

const money = (raw) => {
  const v = Number(String(raw ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
};
const usd = (v) => `$${Number(v).toFixed(2).replace(/\.00$/, "")}`;

/** "Dec sheet received" ticked (on=1) or taken off (on=0) on a lead. */
export async function setDecSheet(formData) {
  const leadId = idFrom(formData, "lead_id");
  if (!leadId) return fail("That lead no longer exists");
  const on = formData.get("on") === "1";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_dec_sheet", { p_lead_id: leadId, p_on: on });
  if (error) return fail(error);
  await logActivity(supabase, on ? "lead.dec_sheet" : "lead.dec_sheet_off", { entity: "lead", entityId: leadId });
  revalidatePath(`/leads/${leadId}`);
  const paid = (data?.pay ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  return ok({ on, paid });
}

/** A manager asks the project's Sales Rep for Special Pay on a lead. */
export async function requestSpecialPay(formData) {
  const leadId = idFrom(formData, "lead_id");
  if (!leadId) return fail("That lead no longer exists");
  const amount = money(formData.get("amount"));
  if (!(amount > 0)) return fail("Enter the amount you're asking for", { amount: "Enter an amount, like 25" });
  const reason = s(formData, "reason");
  if (!reason) return fail("Say what the Special Pay is for", { reason: "Say what it's for" });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_special_pay", { p_lead_id: leadId, p_amount: amount, p_reason: reason });
  if (error) return fail(error);
  await logActivity(supabase, "pay.special_request", { entity: "lead", entityId: leadId, detail: `${usd(amount)} · request ${data}` });
  revalidatePath(`/leads/${leadId}`);
  return ok({ id: data });
}

/** The Sales Rep (or an administrator) approves a request, as asked or adjusted, or declines it. */
export async function decideSpecialPay(formData) {
  const requestId = idFrom(formData, "request_id");
  const leadId = idFrom(formData, "lead_id");
  if (!requestId) return fail("That request no longer exists");
  const approve = formData.get("approve") === "1";
  const amount = approve ? money(formData.get("amount")) : null;
  if (approve && !(amount > 0)) return fail("Enter the amount approved", { amount: "Enter an amount" });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_special_pay", {
    p_request_id: requestId, p_approve: approve, p_amount: amount, p_note: s(formData, "note"),
  });
  if (error) return fail(error);
  await logActivity(supabase, approve ? "pay.special_approved" : "pay.special_declined", {
    entity: "lead", entityId: leadId ?? null, detail: approve ? `${usd(data?.amount ?? amount)} · request ${requestId}` : `request ${requestId}`,
  });
  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath("/reports/pay");
  return ok(data);
}

/** A project's dec sheet rate: an administrator, or the client's Sales Rep. */
export async function setProjectDecSheetRate(formData) {
  const projectId = idFrom(formData, "project_id");
  if (!projectId) return fail("That project no longer exists");
  const rate = money(formData.get("rate"));
  if (!(rate >= 0)) return fail("Choose a dec sheet rate");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_project_dec_sheet_rate", { p_project_id: projectId, p_rate: rate });
  if (error) return fail(error);
  await logActivity(supabase, "project.dec_sheet_rate", { entity: "project", entityId: projectId, detail: usd(data) });
  revalidatePath(`/projects/${projectId}`);
  return ok({ rate: Number(data) });
}

/** A bonus tier list from the form: "50 = 50, 75 = 75" style rows (at_N / amount_N), the empty ones left out. */
function tiers(formData, plan) {
  const out = [];
  for (let i = 0; i < 6; i += 1) {
    const at = String(formData.get(`${plan}_at_${i}`) ?? "").trim();
    const amount = String(formData.get(`${plan}_amount_${i}`) ?? "").trim();
    if (!at && !amount) continue;
    const n = Number.parseInt(at, 10);
    const a = money(amount);
    if (!(n > 0) || !(a > 0)) return { error: `Each tier needs a count and an amount (row ${i + 1})` };
    out.push({ at: n, amount: a });
  }
  out.sort((x, y) => x.at - y.at);
  return { tiers: out };
}

/** Settings › Bonus plans: each plan's tiers, and the days in a pay period's first half. Administrators. */
export async function saveBonusPlans(prevState, formData) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin" || me.status !== "active") return fail("Only administrators can change the bonus plans.");
  const value = {};
  for (const plan of ["lead_weekly", "appt_weekly", "appt_monthly"]) {
    const t = tiers(formData, plan);
    if (t.error) return fail(t.error, { [plan]: t.error });
    value[plan] = t.tiers;
  }
  const first = Number.parseInt(String(formData.get("first_days") ?? "5"), 10);
  if (!(first >= 1 && first <= 30)) return fail("The first half is 1 to 30 days", { first_days: "1 to 30 days" });
  value.first_days = first;
  const units = {};
  for (const k of ["lead", "appointment", "dec_sheet"]) {
    const u = Number(String(formData.get(`unit_${k}`) ?? "").trim());
    if (!(u >= 0 && u <= 100)) return fail("Units are 0 to 100 each", { [`unit_${k}`]: "0 to 100" });
    units[k] = u;
  }
  value.units = units;
  value.monthly_total = formData.get("monthly_total") === "on";

  const { error } = await supabase.from("app_settings").upsert({ key: "bonus_plans", value, updated_at: new Date().toISOString() });
  if (error) return fail(error);
  await logActivity(supabase, "settings.bonus_plans", { detail: JSON.stringify(value).slice(0, 400), userId: me.id });
  revalidatePath("/settings");
  revalidatePath("/reports/pay");
  return ok(value);
}
