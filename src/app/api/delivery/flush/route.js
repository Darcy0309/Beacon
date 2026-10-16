import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { readDeliverySettings, releaseHolds } from "@/features/delivery/holds";
import { clearingDue } from "@/lib/delivery-schedule";
import { publicOrigin } from "@/lib/origin";
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
 * Clear what is held in QA (Sean, Oct 2026): called by the database on the
 * hour (flush_held_deliveries, through pg_net) with the push secret, not by
 * people. Sends every lead and appointment held, but only in one of the
 * clearing hours Settings › Delivery sets (every few hours, 8 AM to 6 PM
 * Pacific to begin with); otherwise nothing. Held-back ones stay.
 */
export async function POST(request) {
  const secret = process.env.PUSH_DELIVER_SECRET;
  if (!secret || !sameSecret(request.headers.get("x-push-secret") ?? "", secret)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "The server's role is not set up" }, { status: 503 });
  const settings = await readDeliverySettings(admin);
  if (!clearingDue(settings)) return NextResponse.json({ sent: 0, due: false });
  const sent = await releaseHolds(admin, { origin: publicOrigin(request.headers) });
  return NextResponse.json({ sent, due: true });
}
