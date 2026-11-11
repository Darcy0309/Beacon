import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAppointmentTexts } from "@/features/texts/appointment-texts";

export const dynamic = "force-dynamic";
// A day's reminders, one after another.
export const maxDuration = 300;

function sameSecret(given, secret) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Send the appointment reminder texts the database has queued (client, Nov 2026): called by the
 * database (queue_appointment_texts(), through pg_net) with the push secret, not by people.
 */
export async function POST(request) {
  const secret = process.env.PUSH_DELIVER_SECRET;
  if (!secret || !sameSecret(request.headers.get("x-push-secret") ?? "", secret)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "The server's role is not set up" }, { status: 503 });
  try {
    return NextResponse.json(await sendAppointmentTexts(admin, publicOrigin(request.headers)));
  } catch (err) {
    console.error("[appointments/texts]", err?.message ?? err);
    return NextResponse.json({ error: "The reminders couldn't be sent" }, { status: 500 });
  }
}
