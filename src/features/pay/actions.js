"use server";

/** Settings › Pay & time. */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, fail, logActivity, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { cross, formValues, schemas } from "@/lib/validate";
import { parsePeriodDays } from "@/lib/pay";

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

/**
 * Add or change one pay period on the schedule: its first and last day, its
 * pay date, and the days closed (not work days) or optional, each set with
 * what it is. Administrators only (the database agrees); periods never
 * overlap (nor does the database let them).
 */
export async function savePayPeriod(prevState, formData) {
  const { values, failed } = check(formData, schemas.payPeriod, cross.payPeriod);
  if (failed) return failed;

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin" || me.status !== "active") return fail("Only administrators can change the pay periods.");

  const from = values.starts_on;
  const to = values.ends_on;
  const row = {
    starts_on: from,
    ends_on: to,
    pay_date: values.pay_date || null,
    closed_dates: parsePeriodDays(values.closed_dates, from, to).dates,
    closed_label: s(formData, "closed_label"),
    optional_dates: parsePeriodDays(values.optional_dates, from, to).dates,
    optional_label: s(formData, "optional_label"),
    updated_at: new Date().toISOString(),
  };
  const id = Number(values.id) || null;
  const { data, error } = id
    ? await supabase.from("pay_periods").update(row).eq("id", id).select("id")
    : await supabase.from("pay_periods").insert(row).select("id");
  if (error?.code === "23P01") {
    return fail("This overlaps another pay period. Change its days, or that period first.", { starts_on: "Overlaps another pay period" }, values);
  }
  if (error) return fail(error, null, values);
  if (!data?.length) return fail("That pay period is no longer on the schedule.");

  await logActivity(supabase, id ? "pay.period.update" : "pay.period.create", { entity: "pay_period", entityId: data[0].id, detail: `${from} – ${to}` });
  revalidatePath("/settings");
  revalidatePath("/reports/pay");
  return ok({ id: data[0].id });
}

/** Take a pay period off the schedule. Administrators only. */
export async function deletePayPeriod(formData) {
  const id = Number(formData.get("id")) || null;
  if (!id) return fail("Missing pay period.");
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin" || me.status !== "active") return fail("Only administrators can change the pay periods.");
  const { data, error } = await supabase.from("pay_periods").delete().eq("id", id).select("id, starts_on, ends_on");
  if (error) return fail(error);
  if (!data?.length) return fail("That pay period is no longer on the schedule.");
  await logActivity(supabase, "pay.period.delete", { entity: "pay_period", entityId: id, detail: `${data[0].starts_on} – ${data[0].ends_on}` });
  revalidatePath("/settings");
  revalidatePath("/reports/pay");
  return ok({ id });
}
