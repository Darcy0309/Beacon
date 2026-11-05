import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/session";
import { canCall, twilioConfig } from "@/lib/server/twilio";
import { identityOf, voiceToken } from "@/lib/twilio-voice";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// How long a calling token lasts; the browser fetches the next shortly before (twilio-line.js).
const TTL = 600;

/**
 * The phone's calling token, for the Twilio line in this browser: who it is
 * on Twilio, good for TTL seconds. 404 while Twilio is not set up: the phone
 * keeps the computer's calling app.
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!canCall(me)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const config = twilioConfig();
  if (!config) return NextResponse.json({ configured: false }, { status: 404 });

  const identity = identityOf(me.id);
  const token = voiceToken({ ...config, identity, ttl: TTL });
  return NextResponse.json({ token, identity, ttl: TTL }, { headers: { "cache-control": "no-store" } });
}

/**
 * This browser is registered with Twilio, so a call coming in can ring it
 * (twilio-line.js says so when it registers, and again with each new token
 * while it stays registered): phone_presence, which the voice webhook rings.
 * Only a registered browser counts: one that merely fetched a token would be
 * rung and answer busy (Nov 2026).
 */
export async function POST() {
  const me = await getCurrentUser();
  if (!canCall(me)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "The server's key is not set" }, { status: 503 });
  const { error } = await admin.from("phone_presence").upsert({ user_id: me.id, seen_at: new Date().toISOString() });
  if (error) {
    console.error("[phone/token] presence", error.message);
    return NextResponse.json({ error: "Calls in could not be turned on for you." }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
