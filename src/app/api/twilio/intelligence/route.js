import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finishCallTranscript } from "@/lib/server/call-ai";

export const dynamic = "force-dynamic";
// The transcript is read and summarized after the answer: room for Claude to write.
export const maxDuration = 60;

/**
 * Twilio's Conversational Intelligence saying a transcript is ready (the Intelligence Service's
 * webhook, which scripts/twilio-setup.mjs sets): { transcript_sid, customer_key, event_type, … }.
 *
 * Twilio does not sign these, so it is taken only as a nudge: nothing in it is believed. The
 * transcript must be one Lighthouse asked for (phone_recordings.transcript_sid), and what it says is
 * read from Twilio with the account's own login (lib/server/call-ai.js).
 */
export async function POST(request) {
  let body = {};
  try {
    const type = request.headers.get("content-type") ?? "";
    body = type.includes("application/json")
      ? await request.json()
      : Object.fromEntries([...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]));
  } catch {
    // Nothing readable: nothing to do.
  }
  const sid = String(body?.transcript_sid ?? body?.TranscriptSid ?? "");
  if (!/^GT[0-9a-f]{32}$/i.test(sid)) return new NextResponse(null, { status: 204 });

  const admin = createAdminClient();
  if (!admin) return new NextResponse(null, { status: 204 });
  const { data: ours } = await admin.from("phone_recordings").select("recording_sid").eq("transcript_sid", sid).maybeSingle();
  if (ours) after(() => finishCallTranscript(admin, sid).catch((err) => console.error("[twilio/intelligence]", err?.message ?? err)));
  return new NextResponse(null, { status: 204 });
}
