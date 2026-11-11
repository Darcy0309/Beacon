"use server";

/** Settings › Appointment reminder texts (client, Nov 2026): the template, and when it goes. */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { ZONES } from "@/lib/delivery-schedule";
import { APPT_TEXT_HOURS, apptTextSettings } from "@/lib/appointment-texts";
import { TEXT_LIMIT } from "@/lib/texts";

export async function saveApptTextSettings(prevState, formData) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me || me.status !== "active" || me.role !== "admin") return fail("Only an administrator can do this.");

  const body = String(formData.get("body") ?? "").replace(/\r\n?/g, "\n").trim();
  const hour = Number(formData.get("hour"));
  const zone = String(formData.get("zone") ?? "");
  const values = { body, hour: String(hour), zone };
  if (!body) return fail("Write the reminder first.", { body: "Write the reminder first" }, values);
  if (body.length > TEXT_LIMIT) return fail(`At most ${TEXT_LIMIT.toLocaleString()} characters.`, { body: "Too long" }, values);
  if (!APPT_TEXT_HOURS.includes(hour)) return fail("Choose when it goes out.", { hour: "Choose a time" }, values);
  if (!ZONES.some(([z]) => z === zone)) return fail("Choose a time zone.", { zone: "Choose a time zone" }, values);

  const saved = apptTextSettings({ body, hour, zone });
  const { error } = await supabase.from("app_settings").upsert({ key: "appt_texts", value: saved, updated_at: new Date().toISOString() });
  if (error) return fail(error, null, values);
  await logActivity(supabase, "settings.appt_texts", { detail: `${hour}:00 ${zone}`, userId: me.id });
  revalidatePath("/settings");
  return ok(saved);
}
