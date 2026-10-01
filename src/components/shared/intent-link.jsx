"use client";

import NextLink from "next/link";
import { useState } from "react";

/**
 * next/link that prefetches only when someone shows they may click it: the
 * pointer comes over it, it takes keyboard focus, or a finger touches it.
 *
 * Next.js prefetches every link as it scrolls into view. Here every page is
 * dynamic and every request checks the session with Supabase, so opening a
 * page with its sidebar and a table of links sent 30-odd prefetches at once,
 * each costing the server two Supabase round trips. The click that mattered
 * queued behind them, and on a slow connection the page it opened could take
 * seconds to appear. Prefetching on intent still gives the link actually
 * clicked its instant loading skeleton.
 *
 * Pass `prefetch` to decide for one link (false: never).
 */
export default function Link({ prefetch, onMouseEnter, onFocus, onTouchStart, ...props }) {
  const [intent, setIntent] = useState(false);
  const showsIntent = (handler) => (event) => {
    if (!intent) setIntent(true);
    handler?.(event);
  };

  return (
    <NextLink
      {...props}
      // null is Next's default prefetch (up to the loading skeleton), once intent is shown.
      prefetch={prefetch !== undefined ? prefetch : intent ? null : false}
      onMouseEnter={showsIntent(onMouseEnter)}
      onFocus={showsIntent(onFocus)}
      onTouchStart={showsIntent(onTouchStart)}
    />
  );
}
