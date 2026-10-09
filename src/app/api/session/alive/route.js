import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import { IDLE_COOKIE, idleCookieValue, idleLimitFor, sessionIdOf } from "@/lib/idle";

export const dynamic = "force-dynamic";

/**
 * The browser says the person is using Lighthouse (IdleGuard, at most once
 * a minute while they are): the time is kept in the idle cookie for this
 * session, which the proxy checks on every request. Returns the limit in
 * minutes, or null for a role without one (the cookie is then removed).
 */
export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Signed out" }, { status: 401 });
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const sid = session ? sessionIdOf(session.access_token) : null;
  const limit = idleLimitFor(me.role);

  const response = NextResponse.json({ limit });
  if (limit && sid) {
    response.cookies.set(IDLE_COOKIE, idleCookieValue(sid), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24,
    });
  } else {
    response.cookies.delete(IDLE_COOKIE);
  }
  return response;
}
