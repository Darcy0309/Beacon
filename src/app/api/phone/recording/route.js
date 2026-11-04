import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/session";
import { canCall, twilioApi, twilioConfig } from "@/lib/server/twilio";
import { identityOf } from "@/lib/twilio-voice";

export const dynamic = "force-dynamic";

/**
 * Record, the phone's button during a call on the Twilio line: starts
 * recording the call (both sides, each on its own channel) or stops it.
 * { callSid, on }. Only one's own call: Twilio must say the call is to or
 * from this person's browser. Recordings are kept in the Twilio account.
 */
export async function POST(request) {
  const me = await getCurrentUser();
  if (!canCall(me)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const config = twilioConfig();
  if (!config) return NextResponse.json({ error: "Twilio is not set up on the server" }, { status: 503 });

  const { callSid, on } = await request.json().catch(() => ({}));
  if (!/^CA[0-9a-f]{32}$/i.test(callSid ?? "")) return NextResponse.json({ error: "No such call" }, { status: 400 });

  try {
    const call = await twilioApi(config, `/Calls/${callSid}.json`);
    const mine = `client:${identityOf(me.id)}`;
    if (call.from !== mine && call.to !== mine) return NextResponse.json({ error: "Not your call" }, { status: 403 });
    if (call.status !== "in-progress") return NextResponse.json({ error: "The call is not connected yet" }, { status: 409 });

    if (on) await twilioApi(config, `/Calls/${callSid}/Recordings.json`, { method: "POST", form: { RecordingChannels: "dual" } });
    else await twilioApi(config, `/Calls/${callSid}/Recordings/Twilio.CURRENT.json`, { method: "POST", form: { Status: "stopped" } });
    return NextResponse.json({ recording: Boolean(on) });
  } catch (err) {
    console.error("[phone/recording]", err?.message ?? err);
    return NextResponse.json({ error: err?.message || "Twilio could not do that" }, { status: 502 });
  }
}
