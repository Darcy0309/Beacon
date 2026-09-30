"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Finishes an email link whose tokens arrived in the URL fragment
 * (#access_token=…), which only the browser can read. Stores the session in
 * the auth cookies, then continues to the page the link was for.
 */
export default function AuthComplete({ next }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      setFailed(true);
      return;
    }
    const supabase = createClient();
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) throw error;
        // A full page load, not a client navigation: the root layout was
        // rendered signed out and must render again with the new session,
        // or the sidebar and role checks keep treating them as signed out.
        window.location.replace(next);
      })
      .catch(() => setFailed(true));
  }, [next]);

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        That link has expired or was already used. Ask an administrator to send a new invitation.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Signing you in…
    </p>
  );
}
