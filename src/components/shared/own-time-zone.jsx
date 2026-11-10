"use client";

import { useEffect, useState } from "react";
import { zoneShort } from "@/lib/own-clock";

/**
 * The browser's time zone (client, Nov 2026: a reminder's time is the person's own), once on the
 * page (the server can't know it): { tz: "America/Los_Angeles", short: "PST" }, nulls until then.
 */
export function useOwnTimeZone() {
  const [zone, setZone] = useState({ tz: null, short: null });
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setZone({ tz, short: zoneShort(tz) });
    } catch {
      // The business's clock, then.
    }
  }, []);
  return zone;
}

/** The browser's time zone in a form, as `tz`. */
export function OwnTimeZoneInput({ tz }) {
  return <input type="hidden" name="tz" value={tz ?? ""} data-own-tz />;
}
