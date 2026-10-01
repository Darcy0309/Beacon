import { NextResponse } from "next/server";
import { isIsoDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Appointments per day between ?from= and ?to= (YYYY-MM-DD), for the dots in
 * the date picker: { days: { "2026-10-01": 3, ... } }. Runs as the signed-in
 * user, so Row Level Security decides what counts. Answers with no days
 * rather than an error when it cannot count: the dots are a hint, not data
 * anyone relies on.
 */
export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) {
    return NextResponse.json({ days: {}, error: "Give from and to as YYYY-MM-DD" }, { status: 400 });
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("appointment_day_counts", { p_from: from, p_to: to });
    if (error) throw error;
    return NextResponse.json(
      { days: Object.fromEntries((data ?? []).map((r) => [r.day, Number(r.appointments)])) },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (err) {
    console.error("[appointment days]", err?.message ?? err);
    return NextResponse.json({ days: {} });
  }
}
