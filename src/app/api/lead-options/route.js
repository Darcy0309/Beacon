import { NextResponse } from "next/server";
import { getLeadOption, searchLeadOptions } from "@/features/leads/queries";

export const dynamic = "force-dynamic";

/**
 * Backs the lead picker in the appointment form: the leads matching what
 * was typed; or with ?id=, that one lead (the phone naming the lead a Call
 * button is on, whichever of its numbers it called). Runs as the signed-in
 * user (the proxy has already checked the session), so results are scoped
 * by Row Level Security.
 */
export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const id = sp.get("id");
  try {
    if (id !== null) {
      if (!/^[1-9]\d{0,17}$/.test(id)) return NextResponse.json({ leads: [] }, { status: 400 });
      const lead = await getLeadOption(id);
      return NextResponse.json({ leads: lead ? [lead] : [] });
    }
    return NextResponse.json({ leads: await searchLeadOptions(q) });
  } catch (err) {
    console.error("[lead-options]", err?.message ?? err);
    return NextResponse.json({ leads: [], error: "Lead search is unavailable right now." }, { status: 502 });
  }
}
