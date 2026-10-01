import { NextResponse } from "next/server";
import { searchLeadOptions } from "@/features/leads/queries";

export const dynamic = "force-dynamic";

/**
 * Backs the lead picker in the appointment form: the leads matching what
 * was typed. Runs as the signed-in user (the proxy has already checked the
 * session), so results are scoped by Row Level Security.
 */
export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  try {
    return NextResponse.json({ leads: await searchLeadOptions(q) });
  } catch (err) {
    console.error("[lead-options]", err?.message ?? err);
    return NextResponse.json({ leads: [], error: "Lead search is unavailable right now." }, { status: 502 });
  }
}
