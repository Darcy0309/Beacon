import { NextResponse } from "next/server";
import { daysBetween, isIsoDate } from "@/lib/dates";
import { getProjectCalendar } from "@/features/calendar/queries";

export const dynamic = "force-dynamic";

/**
 * A project's calendar between ?from= and ?to= (YYYY-MM-DD, at most 100
 * days): its appointments and blocked time, for the calendar on a lead
 * sheet and the warning when a slot is taken. Runs as the signed-in
 * person: Row Level Security decides what they see.
 */
export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const project = sp.get("project");
  const from = sp.get("from");
  const to = sp.get("to");
  if (!/^[1-9]\d{0,17}$/.test(project ?? "") || !isIsoDate(from) || !isIsoDate(to) || to < from || daysBetween(from, to) > 100) {
    return NextResponse.json({ error: "Give project, and from and to as YYYY-MM-DD" }, { status: 400 });
  }
  try {
    const calendar = await getProjectCalendar({ projectId: Number(project), from, to });
    if (!calendar) return NextResponse.json({ error: "No such calendar" }, { status: 404 });
    return NextResponse.json(calendar, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[project calendar]", err?.message ?? err);
    return NextResponse.json({ error: "The calendar could not be read" }, { status: 500 });
  }
}
