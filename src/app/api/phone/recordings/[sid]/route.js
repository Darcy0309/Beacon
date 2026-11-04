import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/session";
import { twilioConfig } from "@/lib/server/twilio";

export const dynamic = "force-dynamic";

/**
 * A recording kept in the Twilio account (a voicemail, linked from its
 * notification), played here for an administrator: Twilio asks for the
 * account's own login to fetch one, which never leaves the server.
 */
export async function GET(request, { params }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin" || me.status !== "active") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const config = twilioConfig();
  if (!config) return NextResponse.json({ error: "Twilio is not set up on the server" }, { status: 503 });
  const { sid } = await params;
  if (!/^RE[0-9a-f]{32}$/i.test(sid)) return NextResponse.json({ error: "No such recording" }, { status: 404 });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings/${sid}.mp3`, {
    headers: { authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}` },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: res.status === 404 ? "No such recording" : "Twilio could not send it" }, { status: res.status === 404 ? 404 : 502 });
  return new NextResponse(res.body, {
    headers: {
      "content-type": "audio/mpeg",
      "content-disposition": `inline; filename="${sid}.mp3"`,
      "cache-control": "private, no-store",
    },
  });
}
