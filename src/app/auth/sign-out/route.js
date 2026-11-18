import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { IDLE_CHOICES, IDLE_COOKIE } from "@/lib/idle";
import { logActivity } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * Signing out, as a plain form post (Nov 2026: "Server Action … was not found on the server" on Sign out).
 * A page opened before a new deployment still holds the old deployment's Server Action ids, so signing out
 * through one failed after each deploy; this address is the same in every deployment. Public in proxy.js
 * (/auth), so it works with a session already gone.
 *
 *   (no fields)              Sign out: every session of the person's, to the sign-in page
 *   idle=1, next, minutes    signed out after time without activity (IdleGuard): this browser's session
 *                            only; the sign-in page says why, and brings them back to `next`
 */
export async function POST(request) {
  const form = await request.formData().catch(() => new FormData());
  const idle = form.get("idle") === "1";
  const supabase = await createClient();
  await logActivity(supabase, idle ? "sign_out.idle" : "sign_out").catch(() => {});
  await supabase.auth.signOut(idle ? { scope: "local" } : undefined).catch(() => {});
  (await cookies()).delete(IDLE_COOKIE);

  let to = "/login";
  if (idle) {
    const back = safeInternalPath(String(form.get("next") ?? "/"), "/");
    const minutes = Number(form.get("minutes"));
    // The time it was, for the sign-in page to say.
    const after = IDLE_CHOICES.some(([v]) => v && v === minutes) ? `&after=${minutes}` : "";
    to = `/login?error=idle${after}${back !== "/" ? `&next=${encodeURIComponent(back)}` : ""}`;
  }
  // 303: the browser goes on to the sign-in page with a GET, not the form post again.
  return NextResponse.redirect(new URL(to, request.url), 303);
}
