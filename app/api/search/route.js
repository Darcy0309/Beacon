import { NextResponse } from "next/server";
import { globalSearch } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Backs the Ctrl+K palette. Runs as the signed-in user (the proxy has
 * already checked the session), so results are scoped by Row Level Security.
 */
export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ groups: [] });
  try {
    return NextResponse.json({ groups: await globalSearch(q) });
  } catch (err) {
    console.error("[search]", err?.message ?? err);
    return NextResponse.json({ groups: [], error: "Search is unavailable right now." }, { status: 502 });
  }
}
