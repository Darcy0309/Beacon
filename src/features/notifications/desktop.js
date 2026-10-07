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
 *
 * With Lighthouse closed: Web Push. Turning them on also subscribes this
 * browser with its push service (save_push_subscription()), so the server
 * can push each new notification to the browser's worker (public/sw.js),
 * which shows it whether or not a tab is open. While this browser is
 * subscribed, the worker shows them all and the tabs show none of their
 * own. When the server has no push keys, the tabs' own pop-ups still work.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pushPublicKey } from "@/features/notifications/push-actions";

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
export const tabInFront = () => typeof document !== "undefined" && inFront();

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
  if (push.active || desktopPermission() !== "granted" || store.get(OFF_KEY) === "1" || anyTabInFront()) return null;
  try {
    const shown = new window.Notification(n.title, {
      body: [n.sender_name ? `From ${n.sender_name}` : null, n.body].filter(Boolean).join("\n"),
      tag: `lighthouse-notification-${n.id}`,
      icon: ICON,
      badge: ICON,
      // A call-back reminder stays on the desktop until it is clicked or closed.
      requireInteraction: n.kind === "reminder",
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

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

/** active: this browser is subscribed, and the worker shows the pop-ups. */
const push = { active: false, syncing: null };

export const pushSupported = () =>
  typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window;

const toBytes = (base64url) => {
  const s = atob(base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "="));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const sameKey = (buffer, key) => {
  if (!buffer) return false;
  const a = new Uint8Array(buffer);
  const b = toBytes(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
};

let keyPromise = null;
const serverKey = () => (keyPromise ??= pushPublicKey().catch(() => null));

/**
 * Make sure this browser is subscribed and saved for whoever is signed in
 * (it may have been someone else's), when desktop notifications are on.
 * Once per page load; the bell calls it, and turnOn() after the browser
 * says yes. Resolves true when push is working.
 */
export function syncPush({ force = false } = {}) {
  if (push.syncing && !force) return push.syncing;
  push.syncing = (async () => {
    if (!pushSupported() || desktopPermission() !== "granted" || store.get(OFF_KEY) === "1") return false;
    const key = await serverKey();
    if (!key) return false;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
        // The server's keys changed: this subscription is no use any more.
        await createClient().rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) });
      const { endpoint, keys } = sub.toJSON();
      const { error } = await createClient().rpc("save_push_subscription", {
        p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      push.active = true;
    } catch (err) {
      console.warn("[push] not subscribed:", err?.message ?? err);
      push.active = false;
    }
    changed();
    return push.active;
  })();
  return push.syncing;
}

/** Stop pushes to this browser (turned off, or signing out). Never throws. */
export async function forgetPush() {
  push.active = false;
  push.syncing = null;
  try {
    const reg = pushSupported() ? await navigator.serviceWorker.getRegistration("/") : null;
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await createClient().rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch (err) {
    console.warn("[push] could not forget this browser:", err?.message ?? err);
  }
  changed();
}

/** Take down the worker's pop-up for a notification read somewhere. */
export async function closePushed(id) {
  try {
    const reg = pushSupported() ? await navigator.serviceWorker.getRegistration("/") : null;
    for (const n of (await reg?.getNotifications({ tag: `lighthouse-notification-${id}` })) ?? []) n.close();
  } catch {
    /* nothing to close */
  }
}

/**
 * For a sign-out form's onSubmit: forget this browser first, so the next
 * person to use it does not get this person's notifications, then sign out.
 */
export function forgetPushThenSubmit(e) {
  const form = e.currentTarget;
  if (form.dataset.pushForgotten) return;
  e.preventDefault();
  const timeout = new Promise((resolve) => setTimeout(resolve, 2000));
  Promise.race([forgetPush(), timeout]).finally(() => {
    form.dataset.pushForgotten = "1";
    form.requestSubmit();
  });
}

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
  const [pushOn, setPushOn] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setStatus(read());
      setPushOn(push.active);
    };
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
    await syncPush({ force: true });
  }, []);

  const turnOff = useCallback(async () => {
    store.set(OFF_KEY, "1");
    changed();
    await forgetPush();
  }, []);

  // Granted in the browser's own settings, or here: subscribe.
  useEffect(() => {
    if (status === "on") syncPush();
  }, [status]);

  return { status, pushing: status === "on" && pushOn, turnOn, turnOff };
}

const ASKED_KEY = "lighthouse:desktop-asked";

/**
 * Offer, once per browser session, to turn desktop notifications on when
 * the browser has not been asked yet: a reminder in the corner of the
 * screen is easy to miss. `offer(turnOn)` shows the offer; returns whether it did.
 */
export function offerDesktopOnce(offer) {
  if (desktopPermission() !== "default" || store.get(OFF_KEY) === "1") return false;
  try {
    if (window.sessionStorage.getItem(ASKED_KEY)) return false;
    window.sessionStorage.setItem(ASKED_KEY, "1");
  } catch {
    return false;
  }
  offer(async () => {
    store.set(OFF_KEY, null);
    await window.Notification.requestPermission();
    changed();
    await syncPush({ force: true });
  });
  return true;
}
