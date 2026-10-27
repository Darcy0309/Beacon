"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { REACH_ERROR, isNetworkError, isNextSignal } from "@/lib/reach";

/**
 * The notices for what goes wrong anywhere (Oct 2026): the connection lost
 * (kept up until it is back) and found again, and a call to the server that
 * failed with nothing on the page to say so (a button whose action threw):
 * one that didn't get there, or one the server broke on.
 */
export default function ConnectionNotices() {
  useEffect(() => {
    const offline = () => toast.warning("You're offline", { id: "connection", duration: Infinity, description: "Changes won't save until the connection is back." });
    const online = () => toast.success("Back online", { id: "connection", duration: 3000 });
    const unhandled = (e) => {
      const err = e.reason;
      if (isNetworkError(err)) toast.error(REACH_ERROR, { id: "reach" });
      // A server action that broke on the server comes back with a digest (its log reference).
      else if (err?.digest && !isNextSignal(err)) toast.error("Something went wrong. Try again, and tell an administrator if it keeps happening.", { id: "server-error", description: `Reference: ${err.digest}` });
    };
    if (!navigator.onLine) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("unhandledrejection", unhandled);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("unhandledrejection", unhandled);
    };
  }, []);
  return null;
}
