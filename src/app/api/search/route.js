import { NextResponse } from "next/server";
import { searchGroupsFor, searchRows, shapeGroups } from "@/features/search/queries";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Backs the Ctrl+K palette. Runs as the signed-in user (the proxy has
 * already checked the session), so results are scoped by Row Level Security,
 * and only kinds of record the user's role can open are searched.
 */
export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ groups: [] });
  // Who is asking and the search itself, at once rather than one after the other (Nov 2026): every
  // kind is searched, Row Level Security scoping each, and only those this role can open are kept.
  const [me, found] = await Promise.all([getCurrentUser(), searchRows(q).then((data) => ({ data }), (error) => ({ error }))]);
  if (!me) return NextResponse.json({ groups: [] }, { status: 401 });
  try {
    if (found.error) throw found.error;
    return NextResponse.json({ groups: shapeGroups(found.data, searchGroupsFor(me.role)) });
  } catch (err) {
    console.error("[search]", err?.message ?? err);
    return NextResponse.json({ groups: [], error: "Search is unavailable right now." }, { status: 502 });
  }
}
