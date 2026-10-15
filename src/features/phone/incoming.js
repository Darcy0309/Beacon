"use client";

// A call coming in (Oct 2026): its ring, and its desktop notification with
// Answer and Decline on it. The buttons on a desktop notification come only
// through the service worker (public/sw.js); it hands a press back to the
// page as { type: "lighthouse:call", action: "answer" | "decline" | "show", id }.
// Without the worker, a plain notification still shows, and clicking it
// brings Lighthouse to the front.

import { desktopAllowed, tabInFront } from "@/features/notifications/desktop";
import { soundOn } from "@/features/notifications/sound";

// A call's own icons (public/phone): the green phone beside it, a plain one for the system's badge, and one on each button.
const ICON = "/phone/call-incoming.png";
const BADGE = "/phone/call-badge.png";
const ACTIONS = [
  { action: "answer", title: "Answer", icon: "/phone/call-answer.png" },
  { action: "decline", title: "Decline", icon: "/phone/call-decline.png" },
];
const tagOf = (id) => `lighthouse-call-${id}`;
let plain = null; // a notification shown without the worker, to close again

/**
 * Show a call's desktop notification, while nobody is looking at Lighthouse
 * and desktop pop-ups are on: stays until answered, declined or closed.
 * `onShow`: what a click on a plain notification does.
 */
export async function showCallNotification({ id, title, body }, onShow) {
  if (!desktopAllowed() || tabInFront()) return false;
  const options = { body, tag: tagOf(id), icon: ICON, badge: BADGE, requireInteraction: true, renotify: true, data: { kind: "call", id } };
  try {
    // The worker the push notifications use; set up here when it is not yet, and waited for until it is running.
    let reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/") : null;
    if ("serviceWorker" in navigator && !reg?.active) {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      reg = await Promise.race([navigator.serviceWorker.ready, new Promise((ok) => setTimeout(() => ok(null), 4000))]);
    }
    if (reg?.active) {
      await reg.showNotification(title, { ...options, actions: ACTIONS });
      return true;
    }
  } catch {
    // No worker here: a plain one, without its buttons.
  }
  try {
    plain = new window.Notification(title, options);
    plain.onclick = () => {
      window.focus();
      plain?.close();
      onShow?.();
    };
    return true;
  } catch {
    return false;
  }
}

/** Take a call's desktop notification away (answered, declined, missed). */
export async function closeCallNotification(id) {
  plain?.close();
  plain = null;
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/") : null;
    for (const n of (await reg?.getNotifications({ tag: tagOf(id) })) ?? []) n.close();
  } catch {
    // Nothing to close.
  }
}

/**
 * The ring: the two tones a US phone rings with, two seconds on and four
 * off, until stopped. Made by the browser (Web Audio); silent when the
 * bell's sound is off. Returns stop().
 */
export function startRingtone() {
  if (!soundOn()) return () => {};
  let ctx = null;
  let timer = null;
  const ring = () => {
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      const at = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.05);
      gain.gain.setValueAtTime(0.12, at + 1.9);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 2);
      gain.connect(ctx.destination);
      for (const freq of [440, 480]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(at);
        osc.stop(at + 2);
      }
    } catch {
      // No sound here: the screen still rings.
    }
  };
  ring();
  timer = setInterval(ring, 6000);
  return () => {
    clearInterval(timer);
    ctx?.close?.().catch?.(() => {});
    ctx = null;
  };
}
