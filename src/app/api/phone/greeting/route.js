import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/session";
import { canCall } from "@/lib/server/twilio";
import { GREETINGS_BUCKET } from "@/lib/server/phone-lines";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Your own voicemail greeting's recording, to hear it back on My Security (Nov 2026). Yours alone. */
export async function GET() {
  const me = await getCurrentUser();
  if (!canCall(me)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "The server's key is not set" }, { status: 503 });
  const { data: u } = await admin.from("users").select("voicemail_audio_path").eq("id", me.id).maybeSingle();
  if (!u?.voicemail_audio_path) return NextResponse.json({ error: "No recording" }, { status: 404 });
  const { data, error } = await admin.storage.from(GREETINGS_BUCKET).download(u.voicemail_audio_path);
  if (error || !data) return NextResponse.json({ error: "No recording" }, { status: 404 });
  return new NextResponse(data, {
    headers: { "content-type": u.voicemail_audio_path.endsWith(".mp3") ? "audio/mpeg" : "audio/wav", "cache-control": "private, no-store" },
  });
}
