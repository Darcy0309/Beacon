/**
 * The phone lines, as the voice webhook reads them (Sean, Nov 2026; lib/phone-lines.js has the rules): the line a
 * call came in on, the manager an extension rings, who last called a number back, a box's greeting and its people,
 * and the caller ID a call goes out with. `db`: the admin client (Twilio's requests have no one signed in).
 */

import "server-only";
import { areaCode } from "@/lib/project-info";
import { DEFAULT_ATTENDANT_GREETING, defaultPersonalGreeting, e164, extensionDigits, pickCallerId } from "@/lib/phone-lines";
import { CALLS_ROLES } from "@/lib/server/twilio";

export const GREETINGS_BUCKET = "voicemail-greetings";

/** The account's lines. */
export async function phoneLines(db) {
  if (!db) return [];
  const { data, error } = await db.from("phone_lines").select("id, number, kind, label, ring_user_ids, area_code").order("number");
  if (error) console.error("[phone-lines]", error.message);
  return data ?? [];
}

/** The line a call came in on (its To), or null for a number not listed. */
export async function lineOf(db, to) {
  const number = e164(to);
  if (!db || !number) return null;
  const { data } = await db.from("phone_lines").select("id, number, kind, label, ring_user_ids").eq("number", number).maybeSingle();
  return data ?? null;
}

/** The managers' line's greeting and the general voicemail's people (app_settings 'phone'). */
export async function lineSettings(db) {
  const { data } = db ? await db.from("app_settings").select("value").eq("key", "phone").maybeSingle() : { data: null };
  const v = data?.value ?? {};
  return {
    attendantGreeting: String(v.attendant_greeting ?? "").trim() || DEFAULT_ATTENDANT_GREETING,
    generalVoicemail: (Array.isArray(v.general_voicemail_users) ? v.general_voicemail_users : []).map(Number).filter((n) => Number.isInteger(n) && n > 0),
  };
}

/** The staff member an extension rings (active, one who calls), or null: none has it, or two do. */
export async function staffByExtension(db, digits) {
  const ext = extensionDigits(digits);
  if (!db || !ext) return null;
  const { data } = await db.from("users").select("id").eq("phone_ext", ext).eq("status", "active").is("deleted_at", null).in("role", CALLS_ROLES).limit(2);
  return data?.length === 1 ? data[0].id : null;
}

/** Who last called a number from Lighthouse (a call back to a local caller ID rings them), or null. */
export async function lastCaller(db, from) {
  const number = e164(from);
  if (!db || !number) return null;
  const { data } = await db.from("phone_calls").select("user_id").eq("direction", "out").eq("number", number)
    .not("user_id", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data?.user_id ?? null;
}

/**
 * A box's greeting, as TwiML: a manager's own recording (played through a link good for ten minutes), else their
 * words or the usual ones in the AI voice; any other box, `fallback`.
 */
export async function greetingFor(db, box, { say, play, fallback }) {
  if (box?.kind !== "user" || !db) return say(fallback);
  const { data: u } = await db.from("users").select("first_name, voicemail_greeting, voicemail_audio_path, voicemail_use_recording").eq("id", box.id).maybeSingle();
  if (!u) return say(fallback);
  if (u.voicemail_use_recording && u.voicemail_audio_path) {
    const { data: signed } = await db.storage.from(GREETINGS_BUCKET).createSignedUrl(u.voicemail_audio_path, 600);
    if (signed?.signedUrl) return play(signed.signedUrl);
  }
  return say(String(u.voicemail_greeting ?? "").trim() || defaultPersonalGreeting(u.first_name));
}

/** The people a box's voicemail goes to: the manager; a line's ring list; the general voicemail's; none (admins). */
export async function boxPeople(db, box) {
  if (!box) return [];
  if (box.kind === "user") return [box.id];
  if (box.kind === "general") return (await lineSettings(db)).generalVoicemail;
  const { data } = db ? await db.from("phone_lines").select("ring_user_ids").eq("id", box.id).maybeSingle() : { data: null };
  return data?.ring_user_ids ?? [];
}

/**
 * The caller ID a call from the browser goes out with (pickCallerId): the one asked for, else the local line in
 * the area code of the lead's project's office (or, without one, its appointment project's), else `fallback`.
 */
export async function callerIdFor(db, { requested, leadId, fallback }) {
  const lines = await phoneLines(db);
  let code = null;
  if (db && leadId && lines.some((l) => l.kind === "local")) {
    const { data: lead } = await db.from("leads").select("project_id").eq("id", leadId).maybeSingle();
    const { data: project } = lead?.project_id ? await db.from("projects").select("phone, appt_project_id").eq("id", lead.project_id).maybeSingle() : { data: null };
    code = areaCode(project?.phone);
    if (!code && project?.appt_project_id) {
      const { data: appt } = await db.from("projects").select("phone").eq("id", project.appt_project_id).maybeSingle();
      code = areaCode(appt?.phone);
    }
  }
  return pickCallerId({ lines, requested, areaCode: code, fallback });
}
