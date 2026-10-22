"use server";

/** Meet the Team: a note to someone, a thank-you or a birthday gift, and the spotlight. */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { GIFTS } from "@/lib/team";

const idOf = (v) => (/^[1-9]\d{0,17}$/.test(String(v ?? "")) ? Number(v) : null);

/** A note to a member of the team, as a message they can answer. */
export async function messageTeamMember(prevState, formData) {
  const to = idOf(formData.get("to"));
  const body = String(formData.get("body") ?? "").trim();
  if (!to) return fail("Choose who to write to.");
  if (!body) return fail("Write your message first", { body: "Write your message" });
  if (body.length > 1000) return fail("Keep a message under 1,000 characters", { body: "Under 1,000 characters" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("message_team_member", { p_to: to, p_body: body });
  if (error) return fail(error);
  return ok({ to });
}

/** A thank-you, or on their birthday a gift (one of GIFTS), with a note. */
export async function sendKudos(prevState, formData) {
  const to = idOf(formData.get("to"));
  const kind = formData.get("kind") === "birthday" ? "birthday" : "thanks";
  const gift = kind === "birthday" ? String(formData.get("gift") ?? "") : null;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!to) return fail("Choose who it is for.");
  if (kind === "birthday" && !GIFTS.some(([k]) => k === gift)) return fail("Choose a gift", { gift: "Choose one" });
  if ((note ?? "").length > 300) return fail("Keep the note under 300 characters", { note: "Under 300 characters" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_kudos", { p_to: to, p_kind: kind, p_gift: gift, p_note: note });
  if (error) return fail(error);
  revalidatePath("/team");
  return ok({ to, kind, gift });
}

/** An administrator shows or hides the week's spotlight on Meet the Team. */
export async function setTeamSpotlight(on) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only an administrator can change that.");
  const { error } = await supabase.from("app_settings").upsert({ key: "team", value: { spotlight: Boolean(on) } }, { onConflict: "key" });
  if (error) return fail(error);
  await logActivity(supabase, "settings.team", { detail: on ? "Spotlight on" : "Spotlight off" });
  revalidatePath("/team");
  return ok({ spotlight: Boolean(on) });
}

/** The latest leads and appointments a member developed (for a client: on its projects), for their profile. */
export async function loadMemberRecent(userId) {
  const id = idOf(userId);
  if (!id) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_member_recent", { p_user_id: id, p_limit: 5 });
  if (error) return [];
  return (data ?? []).map((r) => ({ leadId: r.lead_id, co: r.company, kind: r.kind, at: r.at, project: r.project }));
}
