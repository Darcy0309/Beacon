"use server";

/**
 * A manager's own voicemail greeting (Sean, Nov 2026: "Would it be an AI voice? If so, that would be cool. If
 * not, they can record their own and maybe have that as an option for them"): their words in the AI voice (or the
 * usual ones), or a recording of their own, made in the browser or uploaded. Each person their own.
 */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CALLS_ROLES } from "@/lib/server/twilio";
import { GREETINGS_BUCKET } from "@/lib/server/phone-lines";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mpeg": "mp3", "audio/mp3": "mp3" };

async function caller() {
  const me = await currentAppUser(await createClient());
  return me && CALLS_ROLES.includes(me.role) && me.status === "active" ? me : null;
}

/** The AI voice (their words, or blank for the usual greeting), or their recording when they have one. */
export async function saveMyGreeting(prevState, formData) {
  const me = await caller();
  if (!me) return fail("Only the staff who take calls have a voicemail.");
  const admin = createAdminClient();
  if (!admin) return fail("The server's key is not set.");
  const text = String(formData.get("greeting") ?? "").trim();
  if (text.length > 500) return fail("Keep the greeting under 500 characters.", { greeting: "Too long" });
  const useRecording = formData.get("mode") === "recording";
  const { data: u } = await admin.from("users").select("voicemail_audio_path").eq("id", me.id).maybeSingle();
  if (useRecording && !u?.voicemail_audio_path) return fail("Record or upload your greeting first.");
  const { error } = await admin.from("users").update({ voicemail_greeting: text || null, voicemail_use_recording: useRecording }).eq("id", me.id);
  if (error) return fail(error);
  revalidatePath("/security");
  return ok({ mode: useRecording ? "recording" : "ai", greeting: text });
}

/** Their own recording (a WAV from the browser, or an MP3 or WAV file), used from now on; the one before goes. */
export async function uploadMyGreeting(formData) {
  const me = await caller();
  if (!me) return fail("Only the staff who take calls have a voicemail.");
  const admin = createAdminClient();
  if (!admin) return fail("The server's key is not set.");
  const file = formData.get("file");
  if (!file || typeof file === "string" || !file.size) return fail("Choose a recording.");
  const ext = TYPES[file.type] ?? (/\.mp3$/i.test(file.name) ? "mp3" : /\.wav$/i.test(file.name) ? "wav" : null);
  if (!ext) return fail("Use an MP3 or WAV recording.");
  if (file.size > MAX_BYTES) return fail("Keep the recording under 5 MB (about two minutes).");
  const path = `${me.id}/${Date.now()}.${ext}`;
  const { error: upError } = await admin.storage.from(GREETINGS_BUCKET).upload(path, file, { contentType: ext === "mp3" ? "audio/mpeg" : "audio/wav", upsert: false });
  if (upError) return fail(upError.message);
  const { data: before } = await admin.from("users").select("voicemail_audio_path").eq("id", me.id).maybeSingle();
  const { error } = await admin.from("users").update({ voicemail_audio_path: path, voicemail_use_recording: true }).eq("id", me.id);
  if (error) {
    await admin.storage.from(GREETINGS_BUCKET).remove([path]);
    return fail(error);
  }
  if (before?.voicemail_audio_path && before.voicemail_audio_path !== path) await admin.storage.from(GREETINGS_BUCKET).remove([before.voicemail_audio_path]);
  revalidatePath("/security");
  return ok({ path });
}
