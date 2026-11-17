"use client";

import { Loader2 } from "lucide-react";
import { useLinkStatus } from "next/link";

/**
 * Inside a link: a small spinner beside it while the page it opens is on its way (a manager's dashboard from
 * Daily Production, Nov 2026: the same page with other parameters, so no loading screen shows). Always there,
 * shown by its opacity, so nothing shifts.
 */
export default function LinkPending({ className = "" }) {
  const { pending } = useLinkStatus();
  return (
    <Loader2 aria-hidden data-link-pending={pending || undefined}
      className={`ml-1 inline size-3.5 animate-spin align-[-2px] text-primary transition-opacity ${pending ? "opacity-100" : "opacity-0"} ${className}`} />
  );
}
