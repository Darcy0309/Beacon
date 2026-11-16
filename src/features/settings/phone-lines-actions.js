"use server";

/**
 * Settings → Phone Lines (Sean, Nov 2026): the account's Twilio numbers and what each is for, the managers'
 * line's greeting, and who the general voicemail goes to. Administrators only. A number is bought or ported in
 * Twilio first, and pointed at Lighthouse there (scripts/twilio-setup.mjs); listed here, Lighthouse knows it.
 */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL, e164, lineNumberLabel } from "@/lib/phone-lines";

async function asAdmin() {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  return me?.role === "admin" ? { supabase, me } : { supabase, me: null };
}

const ids = (formData, name) => [...new Set(formData.getAll(name).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 20);
const label = (formData) => String(formData.get("label") ?? "").trim().slice(0, 80) || null;

/** A line added: its number, what it is for, a label ("Signature Marketing", "Eau Claire, WI"), and whom it rings. */
export async function addPhoneLine(prevState, formData) {
  const { supabase, me } = await asAdmin();
  if (!me) return fail("Only an administrator sets the phone lines.");
  const number = e164(formData.get("number"));
  if (!number) return fail("Enter a US phone number, like (715) 555-0100.", { number: "Enter a 10-digit number" });
  const kind = String(formData.get("kind") ?? "");
  if (!KIND_LABEL[kind]) return fail("Choose what the line is for.", { kind: "Choose one" });
  const { error } = await supabase.from("phone_lines").insert({ number, kind, label: label(formData), ring_user_ids: kind === "main" ? ids(formData, "ring") : [], created_by: me.id });
  if (error) return fail(error.code === "23505" ? `${lineNumberLabel(number)} is already one of the lines.` : error);
  await logActivity(supabase, "settings.phone_line", { detail: `added ${lineNumberLabel(number)} (${KIND_LABEL[kind]})`, userId: me.id });
  revalidatePath("/settings");
  return ok({ number });
}

/** A line changed: what it is for, its label, whom it rings. */
export async function updatePhoneLine(prevState, formData) {
  const { supabase, me } = await asAdmin();
  if (!me) return fail("Only an administrator sets the phone lines.");
  const id = Number(formData.get("id"));
  const kind = String(formData.get("kind") ?? "");
  if (!Number.isInteger(id) || id < 1) return fail("That line is no longer there.");
  if (!KIND_LABEL[kind]) return fail("Choose what the line is for.");
  const { data, error } = await supabase.from("phone_lines").update({ kind, label: label(formData), ring_user_ids: kind === "main" ? ids(formData, "ring") : [] })
    .eq("id", id).select("number").maybeSingle();
  if (error) return fail(error);
  if (!data) return fail("That line is no longer there.");
  await logActivity(supabase, "settings.phone_line", { detail: `${lineNumberLabel(data.number)}: ${KIND_LABEL[kind]}`, userId: me.id });
  revalidatePath("/settings");
  return ok({ id });
}

/** A line taken off (the number stays in Twilio; calls to it ring as an unlisted number). */
export async function removePhoneLine(id) {
  const { supabase, me } = await asAdmin();
  if (!me) return fail("Only an administrator sets the phone lines.");
  const { data, error } = await supabase.from("phone_lines").delete().eq("id", Number(id)).select("number").maybeSingle();
  if (error) return fail(error);
  if (data) await logActivity(supabase, "settings.phone_line", { detail: `removed ${lineNumberLabel(data.number)}`, userId: me.id });
  revalidatePath("/settings");
  return ok({ id });
}

/** The managers' line's greeting, and the 1-2 people its general voicemail goes to (not the inbox, Sean). */
export async function savePhoneLineSettings(prevState, formData) {
  const { supabase, me } = await asAdmin();
  if (!me) return fail("Only an administrator sets the phone lines.");
  const greeting = String(formData.get("attendant_greeting") ?? "").trim();
  if (greeting.length > 600) return fail("Keep the greeting under 600 characters.", { attendant_greeting: "Too long" });
  const people = ids(formData, "general");
  const { data: current } = await supabase.from("app_settings").select("value").eq("key", "phone").maybeSingle();
  const value = { ...(current?.value ?? {}), attendant_greeting: greeting || null, general_voicemail_users: people };
  const { error } = await supabase.from("app_settings").upsert({ key: "phone", value, updated_at: new Date().toISOString() });
  if (error) return fail(error);
  await logActivity(supabase, "settings.phone", { detail: `managers' line greeting ${greeting ? "set" : "the usual one"}; general voicemail to ${people.length || "the administrators"}`, userId: me.id });
  revalidatePath("/settings");
  return ok(value);
}
