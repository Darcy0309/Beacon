"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True once running in the browser, where the viewer's time zone is known. */
export function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

const FORMATS = {
  // "Tue, Sep 29, 3:04 PM"
  full: { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  // "3:04 PM"
  time: { hour: "numeric", minute: "2-digit" },
};

/**
 * A timestamp in the viewer's own time zone. The server does not know it,
 * so nothing is rendered there; the text appears once the page is running.
 */
export default function LocalTime({ iso, format = "full", className }) {
  const mounted = useMounted();
  if (!iso) return null;
  return (
    <time dateTime={iso} className={className}>
      {mounted ? new Date(iso).toLocaleString([], FORMATS[format] ?? FORMATS.full) : " "}
    </time>
  );
}
