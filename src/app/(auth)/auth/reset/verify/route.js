import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/**
 * "Set a new password" on /auth/reset: the reset link's one-time token signs the person in, in this browser,
 * whichever one it is, and My Security opens to set the new password. A token used or expired goes to the
 * sign-in page, which says so and how to ask for another.
 */
export async function POST(request) {
  const origin = publicOrigin(request.headers);
  const form = await request.formData().catch(() => new FormData());
  const token = String(form.get("token_hash") ?? "");
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) return NextResponse.redirect(`${origin}/login?error=reset`, 303);
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "recovery" });
  if (error) {
    console.error("[auth/reset]", error.message);
    return NextResponse.redirect(`${origin}/login?error=reset`, 303);
  }
  return NextResponse.redirect(`${origin}/security?reset=1`, 303);
}
