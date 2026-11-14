import { NextResponse } from "next/server";
import { weatherAt } from "@/lib/server/weather";
import { zip5 } from "@/lib/weather";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Project Info's weather card (Sean, Nov 2026): the forecast and warnings at ?zip=, for anyone signed in.
 */
export async function GET(request) {
  const me = await getCurrentUser();
  if (!me || me.status !== "active") return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const zip = zip5(new URL(request.url).searchParams.get("zip"));
  if (!zip) return NextResponse.json({ error: "Give a 5-digit ZIP" }, { status: 400 });
  try {
    const weather = await weatherAt(zip);
    if (!weather) return NextResponse.json({ error: `No forecast found for ${zip}.` }, { status: 404 });
    return NextResponse.json(weather, { headers: { "cache-control": "private, max-age=300" } });
  } catch (err) {
    console.error("[weather]", zip, err?.message ?? err);
    return NextResponse.json({ error: "The weather is unavailable right now." }, { status: 502 });
  }
}
