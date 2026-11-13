import { NextResponse } from "next/server";
import { readView } from "@/features/dashboard/views";
import { getPayRules } from "@/features/pay/queries";
import { getCallActivity } from "@/features/phone/queries";
import { VIEW_PERIODS } from "@/lib/pay";
import { getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const KEYS = VIEW_PERIODS.map(([k]) => k);

/**
 * Call Activity's numbers again, for the dashboard's card while it shows
 * today (it asks every few seconds): the view ?ck= (day, pay period, week,
 * month) around ?cd= (a day; today when none), as the dashboard reads them,
 * for the people ?cs= and ?cu= say.
 */
export async function GET(request) {
  const me = await getCurrentUser();
  if (!["admin", "manager"].includes(me?.role) || me.status !== "active") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  try {
    const [today, rules] = await Promise.all([getBusinessToday(), getPayRules()]);
    const view = readView(sp, { keyParam: "ck", dateParam: "cd", keys: KEYS, today, time: rules.time });
    // ?cs= me or team (a manager's dashboard), else everyone; ?cu= whose line "me" is (the database keeps a
    // manager to their own, so only an administrator seeing a manager's dashboard can name another).
    const scope = ["me", "team"].includes(sp.cs) ? sp.cs : "all";
    const userId = /^[1-9]\d{0,17}$/.test(sp.cu ?? "") ? Number(sp.cu) : me.id;
    const rows = await getCallActivity(view.range, { scope, userId });
    return NextResponse.json({ rows, live: view.showsToday }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[phone/calls]", err?.message ?? err);
    return NextResponse.json({ error: "Call activity is unavailable right now." }, { status: 502 });
  }
}
