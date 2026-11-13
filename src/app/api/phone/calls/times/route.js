import { NextResponse } from "next/server";
import { getCallTimes } from "@/features/phone/queries";
import { isIsoDate } from "@/lib/dates";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Call Activity's chart (Sean, Nov 2026): ?day='s calls by person and half hour, for the people the
 * card shows (?cs= me, team or everyone; ?cu= whose line "me" is). The database keeps a manager to their
 * own line or the team's.
 */
export async function GET(request) {
  const me = await getCurrentUser();
  if (!["admin", "manager"].includes(me?.role) || me.status !== "active") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  if (!isIsoDate(sp.day)) return NextResponse.json({ error: "Give the day as YYYY-MM-DD" }, { status: 400 });
  const scope = ["me", "team"].includes(sp.cs) ? sp.cs : "all";
  const userId = /^[1-9]\d{0,17}$/.test(sp.cu ?? "") ? Number(sp.cu) : me.id;
  try {
    const slots = await getCallTimes(sp.day, { scope, userId });
    return NextResponse.json({ slots }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[phone/calls/times]", err?.message ?? err);
    return NextResponse.json({ error: "The chart is unavailable right now." }, { status: 502 });
  }
}
