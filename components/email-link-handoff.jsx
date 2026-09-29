"use client";

import { useEffect } from "react";

/**
 * Catches an invitation or recovery link that arrived somewhere other than
 * /auth/callback — which is what Supabase does when the callback URL is not
 * on the project's redirect allow-list: it falls back to the site root with
 * the session in the URL fragment, and the proxy then sends a signed-out
 * visitor to /login, fragment and all.
 *
 * Renders nothing; if the fragment holds tokens it forwards them to
 * /auth/complete, which stores the session and continues.
 */
export default function EmailLinkHandoff() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!/access_token=/.test(hash) || !/refresh_token=/.test(hash)) return;
    const next = /type=(invite|signup|magiclink)/.test(hash) ? "/security?welcome=1" : "/security";
    window.location.replace(`/auth/complete?next=${encodeURIComponent(next)}${hash}`);
  }, []);
  return null;
}
