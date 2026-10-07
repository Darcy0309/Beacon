"use client";

/**
 * A chime when a notification arrives, so it is heard, not only seen: two
 * notes, or four rising ones for a call-back reminder. Made by the browser
 * (Web Audio), so there is no sound file to load. On unless someone turns
 * it off in the bell; with several tabs open, one plays it.
 */

import { useCallback, useEffect, useState } from "react";

const OFF_KEY = "lighthouse:notification-sound-off";
const CLAIM = "lighthouse:chimed:";
let audio = null;

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

export const soundOn = () => store.get(OFF_KEY) !== "1";

/** Play the chime for a kind of notification (if sound is on). */
export function playChime(kind) {
  if (!soundOn()) return false;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const notes = kind === "reminder" ? [784, 988, 1175, 1568] : [660, 990];
    notes.forEach((freq, i) => {
      const at = audio.currentTime + i * 0.16;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.16);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Chime once for a notification across every open tab: the first tab to
 * claim it plays. A tab someone is looking at claims at once, the others a
 * moment later, so the one in front is the one heard.
 */
export function chimeOnce(id, kind, inFront) {
  const claim = () => {
    const key = `${CLAIM}${id}`;
    if (store.get(key)) return;
    store.set(key, String(Date.now()));
    playChime(kind);
    // Forget old claims now and then.
    setTimeout(() => store.set(key, null), 60_000);
  };
  if (inFront) claim();
  else setTimeout(claim, 400);
}

const listeners = new Set();

/** Sound on or off, for the switch in the bell. */
export function useNotificationSound() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const refresh = () => setOn(soundOn());
    refresh();
    listeners.add(refresh);
    const onStorage = (e) => e.key === OFF_KEY && refresh();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const set = useCallback((value) => {
    store.set(OFF_KEY, value ? null : "1");
    listeners.forEach((fn) => fn());
    if (value) playChime("message");
  }, []);
  return { on, set };
}
