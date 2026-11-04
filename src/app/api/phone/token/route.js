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
 * on Twilio, good for TTL seconds. Each one fetched also says this person
 * has the phone open (phone_presence), so a call coming in rings them.
 * 404 while Twilio is not set up: the phone keeps the computer's calling app.
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!canCall(me)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const config = twilioConfig();
  if (!config) return NextResponse.json({ configured: false }, { status: 404 });

  const identity = identityOf(me.id);
  const token = voiceToken({ ...config, identity, ttl: TTL });

  const admin = createAdminClient();
  if (admin) {
    const { error } = await admin.from("phone_presence").upsert({ user_id: me.id, seen_at: new Date().toISOString() });
    // Calls out still work; only calls coming in would miss this person.
    if (error) console.error("[phone/token] presence", error.message);
  }

  return NextResponse.json({ token, identity, ttl: TTL }, { headers: { "cache-control": "no-store" } });
}
