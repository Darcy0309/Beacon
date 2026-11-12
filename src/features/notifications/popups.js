"use client";

/**
 * How long a new notification's pop-ups stay up (Sean, Nov 2026: "by the time I look at them and
 * read it, it goes away"). Without the setting, the in-app pop-up stays POPUP_MS and the desktop
 * one as long as the computer keeps them (about five seconds on Windows). With it, both stay until
 * they are closed, as a call-back reminder always has.
 *
 * Kept in this browser (localStorage), and copied where the push worker (public/sw.js) can read it
 * (Cache Storage), since it shows the desktop pop-ups while Lighthouse is closed.
 */

import { useCallback, useEffect, useState } from "react";

const STAY_KEY = "lighthouse:popups-stay";
// Read by public/sw.js: keep the two in step.
const PREFS_CACHE = "lighthouse-prefs";
const PREFS_URL = "/__lighthouse-prefs";

/** The in-app pop-up's time on screen, when it is not kept up. */
export const POPUP_MS = 20_000;

const store = {
  get: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      if (v === null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    } catch {
      /* storage blocked: nothing to remember */
    }
  },
};

/** Whether pop-ups stay up until they are closed. */
export const popupsStay = () => typeof window !== "undefined" && store.get(STAY_KEY) === "1";

/** Tell the push worker the setting. Never throws. */
export async function syncPopupsStay() {
  try {
    if (typeof caches === "undefined") return;
    const cache = await caches.open(PREFS_CACHE);
    await cache.put(PREFS_URL, new Response(JSON.stringify({ stay: popupsStay() }), { headers: { "content-type": "application/json" } }));
  } catch {
    /* no Cache Storage (an insecure page, or blocked): the worker's pop-ups close on their own */
  }
}

const listeners = new Set();

/** The setting, for the switch on the Notifications page. */
export function usePopupsStay() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const refresh = () => setOn(popupsStay());
    refresh();
    listeners.add(refresh);
    const onStorage = (e) => e.key === STAY_KEY && refresh();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const set = useCallback((value) => {
    store.set(STAY_KEY, value ? "1" : null);
    listeners.forEach((fn) => fn());
    syncPopupsStay();
  }, []);
  return { on, set };
}
