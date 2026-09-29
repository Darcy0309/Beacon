import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/validate";
import { publicOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/**
 * Where invitation, recovery and magic-link emails land.
 *
 * Supabase hands over the session one of three ways, depending on how the
 * link was made: a `code` to exchange (PKCE), a `token_hash` to verify, or
 * tokens in the URL fragment, which a server never sees. The first two are
 * handled here; the fragment case is finished in the browser at /auth/complete.
 *
 * Redirects are built from the public origin, not request.url, which behind a
 * proxy is the server's own http://localhost address.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const origin = publicOrigin(request.headers);
  const next = safeInternalPath(searchParams.get("next"), "/security?welcome=1");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();
  let error = null;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    // Nothing in the query string: the tokens are in the fragment.
    return NextResponse.redirect(`${origin}/auth/complete?next=${encodeURIComponent(next)}`);
  }

  if (error) {
    console.error("[auth/callback]", error.message);
    return NextResponse.redirect(`${origin}/login?error=link`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
