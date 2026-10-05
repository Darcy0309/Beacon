"use server";

/** Settings › Pay & time. */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, fail, logActivity, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { cross, formValues, schemas } from "@/lib/validate";

const money = (formData, key) => Math.round(Number(String(formData.get(key) ?? "").replace(/[$,\s]/g, "")) * 100) / 100;
const whole = (formData, key) => Number.parseInt(String(formData.get(key) ?? ""), 10);

/**
 * Save the pay and time rules: the range each project rate is picked from
 * (and the steps between the choices), the hourly range, how time worked is
 * counted, and the pay period. Administrators only (the database agrees).
 */
export async function savePayRules(prevState, formData) {
  const { failed } = check(formData, schemas.payRules, cross.payRules);
  if (failed) return failed;

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin" || me.status !== "active") return fail("Only administrators can change pay rules.");

  const range = (kind, withStep = true) => ({
    min: money(formData, `${kind}_min`),
    max: money(formData, `${kind}_max`),
    ...(withStep ? { step: money(formData, `${kind}_step`) } : {}),
  });
  const rates = { lead: range("lead"), appointment: range("appointment"), special: range("special"), hourly: range("hourly", false) };
  const time = {
    idle_minutes: whole(formData, "idle_minutes"),
    call_minutes: whole(formData, "call_minutes"),
    rounding: s(formData, "rounding"),
    round_to: whole(formData, "round_to"),
    pay_period: s(formData, "pay_period"),
    period_start: s(formData, "period_start"),
  };

  const now = new Date().toISOString();
  const { error } = await supabase.from("app_settings").upsert([
    { key: "pay_rates", value: rates, updated_at: now },
    { key: "time_tracking", value: time, updated_at: now },
  ]);
  if (error) return fail(error, null, formValues(formData, Object.keys(schemas.payRules)));

  await logActivity(supabase, "settings.pay", {
    entity: "settings",
    detail: `lead $${rates.lead.min}–$${rates.lead.max} · appointment $${rates.appointment.min}–$${rates.appointment.max} · special $${rates.special.min}–$${rates.special.max} · hourly $${rates.hourly.min}–$${rates.hourly.max}`,
  });
  revalidatePath("/settings");
  revalidatePath("/reports/pay");
  revalidatePath("/reports/production");
  return ok({ rates, time });
}
