import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/session";
import { canCall } from "@/lib/server/twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { startCallTranscript, transcriptsReady } from "@/lib/server/call-transcripts";
import { fullName } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Transcribe a recorded call now (client, Nov 2026: "it doesn't show transcript"): one never sent
 * (recorded before transcripts were set up, or while they weren't), or one that failed, asked of
 * Twilio again. The person who recorded it, or an administrator, as for playing it. Answers with
 * where it stands: { status: "transcribing" | "failed", error }. Already done or under way: as it is.
 */
export async function POST(request, { params }) {
  const me = await getCurrentUser();
  if (!canCall(me)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { sid } = await params;
  if (!/^RE[0-9a-f]{32}$/i.test(sid)) return NextResponse.json({ error: "No such recording" }, { status: 404 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "The server's key is not set" }, { status: 503 });

  const { data: rec } = await admin.from("phone_recordings").select("user_id, transcript_status, transcript_error").eq("recording_sid", sid).maybeSingle();
  if (!rec) return NextResponse.json({ error: "No such recording" }, { status: 404 });
  if (me.role !== "admin" && rec.user_id !== me.id) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (rec.transcript_status === "transcribing" || rec.transcript_status === "done") {
    return NextResponse.json({ status: rec.transcript_status, error: rec.transcript_error ?? null });
  }
  if (!transcriptsReady()) {
    return NextResponse.json({ error: "Call transcripts aren't set up on the server yet: an administrator adds Twilio's Intelligence Service (TWILIO_INTELLIGENCE_SERVICE_SID)." }, { status: 503 });
  }

  const { data: who } = await admin.from("users").select("first_name, last_name").eq("id", rec.user_id).maybeSingle();
  await startCallTranscript(admin, { recordingSid: sid, callerName: fullName(who) || null });
  const { data: now } = await admin.from("phone_recordings").select("transcript_status, transcript_error").eq("recording_sid", sid).maybeSingle();
  return NextResponse.json({ status: now?.transcript_status ?? "failed", error: now?.transcript_error ?? null });
}
