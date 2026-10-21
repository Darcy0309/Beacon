"use server";

/** The dashboard: a manager's goals for the day, and moving things on their calendar. */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, fail, idFrom, logActivity, ok } from "@/lib/server/action-helpers";
import { getBusinessToday } from "@/lib/server/business-day";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";

const count = (v) => (v === "" || v == null ? null : Number.parseInt(String(v), 10));

/**
 * Set today's goals: how many leads and appointments the signed-in manager
 * means to develop. The day is the business's; the goals are theirs alone
 * (the database agrees). Empty clears one.
 */
export async function saveDailyGoals(prevState, formData) {
  const { values, failed } = check(formData, schemas.dailyGoals);
  if (failed) return failed;

  const supabase = await createClient();
  const [me, day] = await Promise.all([currentAppUser(supabase), getBusinessToday()]);
  if (!me || !["manager", "agent", "admin"].includes(me.role)) return fail("Only staff set daily goals.");

  const { error } = await supabase.from("daily_goals").upsert(
    { user_id: me.id, day, leads_goal: count(values.leads_goal), appts_goal: count(values.appts_goal), updated_at: new Date().toISOString() },
    { onConflict: "user_id,day" }
  );
  if (error) return fail(error, null, values);
  revalidatePath("/");
  return ok({ day });
}

/**
 * Move something on the manager's own calendar to another day and time:
 * an appointment they set (move_appointment(): not one gone by or marked
 * invalid) or a call-back reminder not yet gone off (move_reminder()).
 */
export async function moveScheduleItem(formData) {
  const { values, failed } = check(formData, schemas.scheduleMove);
  if (failed) return failed;
  const supabase = await createClient();
  const appointment = values.kind === "appointment";
  const { data, error } = await supabase.rpc(appointment ? "move_appointment" : "move_reminder", {
    p_id: Number(values.id), p_date: values.date, p_time: values.time,
  });
  if (error) return fail(error);
  await logActivity(supabase, appointment ? "appointment.moved" : "lead.reminder", {
    entity: appointment ? "appointment" : "reminder", entityId: Number(values.id), detail: `${values.date} ${values.time}`,
  });
  revalidatePath("/");
  if (appointment) {
    revalidatePath("/appointments");
    revalidatePath("/calendar");
  }
  return ok(data);
}

/**
 * An administrator sets a month's production goals: leads, appointments,
 * and the rates per hour aimed for. Empty clears one.
 */
export async function saveProductionGoal(prevState, formData) {
  const { values, failed } = check(formData, schemas.productionGoal);
  if (failed) return failed;
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only an administrator sets the production goals.");
  const whole = (v) => (v === "" || v == null ? null : Number.parseInt(String(v), 10));
  const rate = (v) => (v === "" || v == null ? null : Number(v));
  const { error } = await supabase.from("production_goals").upsert({
    month: `${values.month.slice(0, 8)}01`,
    leads_goal: whole(values.leads_goal), appts_goal: whole(values.appts_goal),
    leads_per_hour: rate(values.leads_per_hour), appts_per_hour: rate(values.appts_per_hour),
    updated_by: me.id, updated_at: new Date().toISOString(),
  }, { onConflict: "month" });
  if (error) return fail(error, null, values);
  await logActivity(supabase, "production.goal", { detail: values.month.slice(0, 7) });
  revalidatePath("/");
  return ok({ month: values.month });
}

/**
 * A client's premium goal for the year (the Sale Pipeline, Sean, Oct 2026): their own, or, for an
 * administrator on a client's page, that client's. The database checks who may.
 */
export async function setClientGoal(formData) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me) return fail("Please sign in again.");
  const year = Number(formData.get("year"));
  const goal = Number(String(formData.get("goal") ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail("Which year is this goal for?");
  if (!Number.isFinite(goal) || goal < 0 || goal > 999999999999) return fail("Enter the goal as an amount, e.g. 250,000.");
  let companyId = idFrom(formData, "company_id");
  if (!companyId) {
    const { data } = await supabase.from("users").select("company_id").eq("id", me.id).maybeSingle();
    companyId = data?.company_id ?? null;
  }
  if (!companyId) return fail("This account is not linked to a client.");
  const { error } = await supabase.rpc("set_client_goal", { p_company_id: companyId, p_year: year, p_goal: goal });
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok({ goal });
}

/**
 * A note about a lead to the manager who developed it (Recent Activity, Sean, Oct 2026): delivered
 * as a message in their notifications, linked to the lead, that they can reply to. The database
 * checks the lead is the client's and the manager worked it.
 */
export async function messageManager(formData) {
  const leadId = idFrom(formData, "lead_id");
  const managerId = idFrom(formData, "manager_id");
  const body = String(formData.get("body") ?? "").trim();
  if (!leadId || !managerId) return fail("That lead or manager could not be found.");
  if (!body) return fail("Write your message first.");
  if (body.length > 1000) return fail("Keep a message under 1,000 characters.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("message_manager", { p_lead_id: leadId, p_manager_id: managerId, p_body: body });
  if (error) return fail(error.message);
  if (!data) return fail("It could not be delivered: that manager may no longer be active.");
  return ok({ sent: data });
}
