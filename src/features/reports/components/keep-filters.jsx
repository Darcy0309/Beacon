"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Keeps a report's filters for the rest of the day (Sean, Oct 2026: a
 * manager's Pipeline Report): each change is kept on this computer with the
 * day; coming back without filters on that same day puts them back. A new
 * day starts clean. `keys`: the filters' parameters; `day`: the business's today.
 */
export default function KeepFilters({ storageKey, keys, day }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const restored = useRef(false);

  useEffect(() => {
    const current = new URLSearchParams();
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v) current.set(k, v);
    }
    const qs = current.toString();
    if (!restored.current) {
      restored.current = true;
      // Opened with no filters: today's, if there are any.
      if (!qs) {
        try {
          const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
          if (saved?.day === day && saved.qs) {
            router.replace(`${pathname}?${saved.qs}`, { scroll: false });
            return;
          }
        } catch {
          // Nothing kept, or storage is off: the page as it is.
        }
      }
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ day, qs }));
    } catch {
      // Kept for this visit only.
    }
  }, [searchParams, keys, day, storageKey, pathname, router]);

  return null;
}
