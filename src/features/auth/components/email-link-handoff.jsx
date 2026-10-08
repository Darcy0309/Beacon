"use client";

import { useEffect } from "react";

/**
 * Catches an invitation or recovery link that arrived somewhere other than
 * /auth/callback — which is what Supabase does when the callback URL is not
 * on the project's redirect allow-list: it falls back to the site root with
 * the session in the URL fragment (invitations) or a `code` in the query
 * (password resets), and the proxy then sends a signed-out visitor to
 * /login, carrying either along.
 *
 * Renders nothing; tokens in the fragment go to /auth/complete, a code to
 * /auth/callback, and both continue to My Security.
 */
export default function EmailLinkHandoff() {
  useEffect(() => {
    const hash = window.location.hash;
    if (/access_token=/.test(hash) && /refresh_token=/.test(hash)) {
      const next = /type=(invite|signup|magiclink)/.test(hash) ? "/security?welcome=1" : "/security";
      window.location.replace(`/auth/complete?next=${encodeURIComponent(next)}${hash}`);
      return;
    }
    // Only "Forgot your password?" makes code links (PKCE); the code is
    // exchanged with the verifier this browser kept when the link was asked for.
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent("/security?reset=1")}`);
    }
  }, []);
  return null;
}
