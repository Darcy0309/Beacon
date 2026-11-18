import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/session";
import { canCall } from "@/lib/server/twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeCall } from "@/lib/server/call-summaries";

export const dynamic = "force-dynamic";
// Claude takes a few seconds; room for one slow answer and a retry.
export const maxDuration = 60;

/**
 * A recorded call's AI summary (client, Nov 2026): written from its transcript once, then kept with
 * the recording. The person who recorded it, or an administrator, as for playing it. Body (optional):
 * { again: true } writes it afresh; { ours, theirs } the caller's and the contact's names for Claude.
 * Answers { summary } or { error }.
 */
export async function POST(request, { params }) {
  const me = await getCurrentUser();
  if (!canCall(me)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { sid } = await params;
  if (!/^RE[0-9a-f]{32}$/i.test(sid)) return NextResponse.json({ error: "No such recording" }, { status: 404 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "The server's key is not set" }, { status: 503 });
  const body = await request.json().catch(() => ({}));

  const { data: rec } = await admin.from("phone_recordings").select("user_id, transcript_status, transcript, summary").eq("recording_sid", sid).maybeSingle();
  if (!rec) return NextResponse.json({ error: "No such recording" }, { status: 404 });
  if (me.role !== "admin" && rec.user_id !== me.id) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (rec.summary && body?.again !== true) return NextResponse.json({ summary: rec.summary });
  if (rec.transcript_status !== "done" || !rec.transcript?.length) {
    return NextResponse.json({ error: "The call has to be transcribed first." }, { status: 409 });
  }

  const name = (v) => (typeof v === "string" ? v.slice(0, 80) : null);
  const { summary, model, error } = await summarizeCall(rec.transcript, { ours: name(body?.ours), theirs: name(body?.theirs) });
  if (error) return NextResponse.json({ error }, { status: 502 });

  const { error: saveErr } = await admin.from("phone_recordings")
    .update({ summary, summary_at: new Date().toISOString(), summary_model: model })
    .eq("recording_sid", sid);
  if (saveErr) console.error("[call-summaries] not kept", saveErr.message);
  return NextResponse.json({ summary });
}
