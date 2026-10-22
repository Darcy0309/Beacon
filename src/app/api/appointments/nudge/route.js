import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { flushOutbox } from "@/lib/server/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
// A batch of emails can take a while.
export const maxDuration = 300;

function sameSecret(given, secret) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Send the emails the database has queued (email_outbox; Sean, Oct 2026):
 * called by the database (nudge_appointment_updates(), through pg_net) with
 * the push secret, not by people, once it has queued the reminders to update
 * an appointment; it sends whatever else is waiting too (appointment updates
 * for the administrators and managers, should one not have gone at once).
 */
export async function POST(request) {
  const secret = process.env.PUSH_DELIVER_SECRET;
  if (!secret || !sameSecret(request.headers.get("x-push-secret") ?? "", secret)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "The server's role is not set up" }, { status: 503 });
  return NextResponse.json(await flushOutbox(admin, publicOrigin(request.headers)));
}
