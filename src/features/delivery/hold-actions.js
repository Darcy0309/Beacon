"use server";

/**
 * Leads and appointments held in QA (Sean, Oct 2026): sent by an
 * administrator, one, some or all; held back with a note to the manager;
 * marked fixed by the manager; and Settings › Delivery. Each checks who is
 * asking, then works with the server's role.
 */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, idFrom, logActivity, ok, requestOrigin } from "@/lib/server/action-helpers";
import { CLEARING_CHOICES, DELIVERY_MODES, ZONES, deliverySettings } from "@/lib/delivery-schedule";
import { ADMIN_UNAVAILABLE, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { failHold, fixHold, releaseHolds } from "@/features/delivery/holds";

async function asAdmin() {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me || me.status !== "active" || me.role !== "admin") return { failed: fail("Only an administrator can do this.") };
  const admin = createAdminClient();
  if (!admin) return { failed: fail(ADMIN_UNAVAILABLE) };
  return { supabase, me, admin };
}

const refresh = () => {
  revalidatePath("/qa");
  revalidatePath("/calendar");
};

/** Send the held ones picked (ids, several values), or every one held ("all"). */
export async function sendHeldDeliveries(formData) {
  const { failed, supabase, me, admin } = await asAdmin();
  if (failed) return failed;
  const all = formData.get("all") === "1";
  const ids = all ? null : [...new Set(formData.getAll("id").map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 500);
  if (!all && !ids.length) return fail("Choose what to send.");
  const sent = await releaseHolds(admin, { ids, sentBy: me.id, origin: await requestOrigin() });
  await logActivity(supabase, "delivery.release", { detail: `${sent} sent${all ? " (all)" : ""}`, userId: me.id });
  refresh();
  return ok({ sent });
}

/** Hold one back: not sent, the manager told why. */
export async function failHeldDelivery(prevState, formData) {
  const { failed, supabase, me, admin } = await asAdmin();
  if (failed) return failed;
  const id = idFrom(formData);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!id) return fail("That one is no longer waiting.");
  if (!note) return fail("Say what needs fixing, so the manager can put it right.", { note: "Required" });
  if (!(await failHold(admin, { id, note, by: me.id }))) return fail("That one is no longer waiting.");
  await logActivity(supabase, "delivery.fail", { detail: note.slice(0, 120), userId: me.id });
  refresh();
  return ok({ id });
}

/** The manager (or an administrator) put it right: it waits again, to be sent. */
export async function markHoldFixed(formData) {
  const id = idFrom(formData);
  if (!id) return fail("That one is no longer held back.");
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  // Seen as them: a manager sees only their own (Row Level Security), an administrator every one.
  const { data: hold } = await supabase.from("delivery_holds").select("id, lead_id, status").eq("id", id).maybeSingle();
  if (!me || !hold || (me.role !== "admin" && me.role !== "manager")) return fail("That one is no longer held back.");
  const admin = createAdminClient();
  if (!admin) return fail(ADMIN_UNAVAILABLE);
  if (!(await fixHold(admin, id))) return fail("That one is no longer held back.");
  await logActivity(supabase, "delivery.fixed", { entity: "lead", entityId: hold.lead_id, userId: me.id });
  revalidatePath(`/leads/${hold.lead_id}`);
  refresh();
  return ok({ id });
}

/** Settings › Delivery: leads and appointments now or held, and when held ones clear. */
export async function saveDeliverySettings(prevState, formData) {
  const { failed, supabase, me } = await asAdmin();
  if (failed) return failed;
  const modes = new Set(DELIVERY_MODES.map(([v]) => v));
  const value = {
    leads: String(formData.get("leads")), appointments: String(formData.get("appointments")),
    every: Number(formData.get("every")), from: Number(formData.get("from")), to: Number(formData.get("to")), zone: String(formData.get("zone")),
  };
  if (!modes.has(value.leads) || !modes.has(value.appointments)) return fail("Choose how each goes out.");
  if (!CLEARING_CHOICES.some(([n]) => n === value.every)) return fail("Choose how often held ones go out.");
  if (!ZONES.some(([z]) => z === value.zone)) return fail("Choose a time zone.");
  if (!(Number.isInteger(value.from) && Number.isInteger(value.to) && value.from >= 0 && value.to <= 23 && value.to >= value.from)) {
    return fail("The last hour must be at or after the first.", { to: "At or after the first hour" });
  }
  const saved = deliverySettings(value);
  const { error } = await supabase.from("app_settings").upsert({ key: "delivery", value: saved, updated_at: new Date().toISOString() });
  if (error) return fail(error);
  await logActivity(supabase, "settings.delivery", { detail: `leads ${saved.leads}, appointments ${saved.appointments}, every ${saved.every}h ${saved.from}-${saved.to}`, userId: me.id });
  revalidatePath("/settings");
  refresh();
  return ok(saved);
}
