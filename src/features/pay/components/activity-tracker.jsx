"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// At most one report this often: the server keeps one row a minute anyway.
const EVERY_MS = 30_000;

/**
 * Tells the server that the signed-in account manager is working: a click
 * or key press anywhere in the workspace, at most twice a minute. Moving the
 * mouse or scrolling does not count, nor does a page left open. Pressing a
 * phone link ("Call now") is reported at once with the name being called,
 * so the call counts as work until its result is saved.
 *
 * Only that something happened is sent: track_activity() stamps the time
 * on the server, so nothing here can add or backdate time worked.
 */
export default function ActivityTracker() {
  useEffect(() => {
    const supabase = createClient();
    let last = 0;
    const send = (kind, lead = null) => {
      last = Date.now();
      // Never in anyone's way: a report that fails is simply not counted.
      supabase.rpc("track_activity", { p_kind: kind, p_lead: lead }).then(() => {}, () => {});
    };

    const onUse = () => {
      if (Date.now() - last >= EVERY_MS) send("use");
    };
    const onClick = (e) => {
      const phone = e.target instanceof Element ? e.target.closest('a[href^="tel:"]') : null;
      if (!phone) return;
      const lead = Number(phone.closest("[data-lead-id]")?.getAttribute("data-lead-id"));
      send("call", Number.isInteger(lead) && lead > 0 ? lead : null);
    };

    document.addEventListener("pointerdown", onUse, true);
    document.addEventListener("keydown", onUse, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onUse, true);
      document.removeEventListener("keydown", onUse, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
