"use client";

/**
 * Desktop notifications: the operating system's own pop-up (Windows, macOS,
 * ChromeOS, Linux) for a new notification, shown while Lighthouse is open
 * but nobody is looking at it: another window or app in front, the tab in
 * the background, the browser minimised. While someone is looking, the
 * bell's in-app pop-up is enough.
 *
 * The browser asks once whether Lighthouse may show them; the person can
 * also turn them off here without changing the browser's answer.
 *
 * With several tabs open, each one hears every new notification. Only the
 * tab someone is looking at shows the in-app pop-up, and when none is in
 * front each tab's desktop pop-up carries the same tag, so the system shows
 * it once.
 */

import { useCallback, useEffect, useState } from "react";

const OFF_KEY = "lighthouse:desktop-notifications-off";
const FRONT_KEY = "lighthouse:front-tab"; // "<tab id> <time>" while a tab is in front
const FRONT_FRESH_MS = 60_000;
const ICON = "/notification-icon.png";
const tabId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

const store = {
  get: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      /* private window or storage blocked: nothing to remember */
    }
  },
};

export const desktopSupported = () => typeof window !== "undefined" && "Notification" in window && window.isSecureContext;

/** "granted", "denied", "default" (not asked yet), or "unsupported". */
export const desktopPermission = () => (desktopSupported() ? window.Notification.permission : "unsupported");

/** Whether someone is looking at this tab right now. */
const inFront = () => document.visibilityState === "visible" && document.hasFocus();

/** Whether someone is looking at any Lighthouse tab in this browser. */
function anyTabInFront() {
  if (inFront()) return true;
  const [id, at] = String(store.get(FRONT_KEY) ?? "").split(" ");
  return Boolean(id) && id !== tabId && Date.now() - Number(at) < FRONT_FRESH_MS;
}

/**
 * Keep FRONT_KEY up to date for this tab: set while it is in front (renewed,
 * so a tab that crashed does not hold it), cleared when it goes behind.
 * Returns a cleanup function.
 */
export function trackFrontTab() {
  const update = () => {
    const [id] = String(store.get(FRONT_KEY) ?? "").split(" ");
    if (inFront()) store.set(FRONT_KEY, `${tabId} ${Date.now()}`);
    else if (id === tabId) store.set(FRONT_KEY, null);
  };
  update();
  const events = ["focus", "blur", "pagehide"];
  for (const e of events) window.addEventListener(e, update);
  document.addEventListener("visibilitychange", update);
  const timer = setInterval(update, FRONT_FRESH_MS / 3);
  return () => {
    for (const e of events) window.removeEventListener(e, update);
    document.removeEventListener("visibilitychange", update);
    clearInterval(timer);
    const [id] = String(store.get(FRONT_KEY) ?? "").split(" ");
    if (id === tabId) store.set(FRONT_KEY, null);
  };
}

/**
 * Show a notification on the desktop if it may and should be: permission
 * given, not turned off, and nobody looking at Lighthouse. `onOpen` runs
 * when it is clicked, after the window comes to the front. Returns the
 * desktop notification, or null when none was shown.
 */
export function showDesktop(n, onOpen) {
  if (desktopPermission() !== "granted" || store.get(OFF_KEY) === "1" || anyTabInFront()) return null;
  try {
    const shown = new window.Notification(n.title, {
      body: [n.sender_name ? `From ${n.sender_name}` : null, n.body].filter(Boolean).join("\n"),
      tag: `lighthouse-notification-${n.id}`,
      icon: ICON,
      badge: ICON,
    });
    shown.onclick = () => {
      window.focus();
      shown.close();
      onOpen();
    };
    return shown;
  } catch {
    // Some browsers (Android Chrome) only show them through a service worker.
    return null;
  }
}

/** A sample, shown even while Lighthouse is in front, so someone can see them working. */
export function testDesktop() {
  if (desktopPermission() !== "granted") return false;
  try {
    const shown = new window.Notification("Desktop notifications are on", {
      body: "New notifications will show here while Lighthouse is in the background.",
      tag: "lighthouse-test",
      icon: ICON,
      badge: ICON,
    });
    shown.onclick = () => {
      window.focus();
      shown.close();
    };
    return true;
  } catch {
    return false;
  }
}

const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn());

/**
 * The person's choice, for the switch in the bell and the inbox:
 *   status    "on", "off", "ask" (not asked yet), "blocked" (the browser said no), "unsupported"
 *   turnOn()  asks the browser when it has not been asked, and clears "off"
 *   turnOff() stops them in this browser, without changing the browser's answer
 */
export function useDesktopNotifications() {
  const read = () => {
    const p = desktopPermission();
    if (p === "unsupported") return "unsupported";
    if (p === "denied") return "blocked";
    if (p === "default") return "ask";
    return store.get(OFF_KEY) === "1" ? "off" : "on";
  };
  // "unsupported" on the server and in the first render, so both agree.
  const [status, setStatus] = useState("unsupported");

  useEffect(() => {
    const refresh = () => setStatus(read());
    refresh();
    listeners.add(refresh);
    // The answer can change in the browser's own site settings, or in another tab.
    let perm;
    navigator.permissions?.query({ name: "notifications" }).then((p) => {
      perm = p;
      p.onchange = refresh;
    }).catch(() => {});
    const onStorage = (e) => e.key === OFF_KEY && refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      listeners.delete(refresh);
      if (perm) perm.onchange = null;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const turnOn = useCallback(async () => {
    store.set(OFF_KEY, null);
    if (desktopPermission() === "default") await window.Notification.requestPermission();
    changed();
  }, []);

  const turnOff = useCallback(() => {
    store.set(OFF_KEY, "1");
    changed();
  }, []);

  return { status, turnOn, turnOff };
}
