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

// The notes the melodies are made of (Hz).
const N = {
  B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, Gs4: 415.3, Fs4: 369.99, A4: 440, B4: 493.88,
  C5: 523.25, D5: 587.33, Ds5: 622.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5,
};

/**
 * One sound, at `at` seconds on the audio clock: `freqs` together, for `dur` seconds. `struck`: it dies
 * away as a struck bell or bar does, rather than holding and stopping.
 */
function tone(ctx, at, freqs, dur, { type = "sine", vol = 0.12, struck = false, lowpass = 0, vibrato = 0 } = {}) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + (struck ? 0.005 : 0.03));
  if (struck) gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  else {
    gain.gain.setValueAtTime(vol, at + Math.max(0.04, dur - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  }
  // Into the ringtone's own volume (playTone), so stopping it can fade it out.
  gain.connect(ctx.ringOut ?? ctx.destination);
  // `lowpass` (Hz) softens a bright wave into a reed's or a string's; `vibrato` (cents) wavers it, as a player does.
  let into = gain;
  if (lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    filter.connect(gain);
    into = filter;
  }
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = freq * (2 ** (vibrato / 1200) - 1);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(at + 0.12);
      lfo.stop(at + dur + 0.02);
    }
    osc.connect(into);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }
}

/** A note by its MIDI number (60 is middle C), for the chords and lines below. */
const m = (n) => 440 * 2 ** ((n - 69) / 12);

/** Chords and notes at given beats: [beat, [MIDI notes], beats long], `beat` seconds each. */
function hits(ctx, at, list, beat, opts) {
  for (const [b, notes, len] of list) tone(ctx, at + b * beat, notes.map(m), len * beat, opts);
}

/** A melody: [note, beats] in turn (a null note is a rest), `beat` seconds each. */
function melody(ctx, at, notes, beat, opts) {
  let t = at;
  for (const [note, beats] of notes) {
    if (note) tone(ctx, t, [N[note]], beats * beat * (opts?.struck ? 2.2 : 0.92), opts);
    t += beats * beat;
  }
}

/**
 * The phone's ringtones (Sean, Nov 2026), picked under its Settings: the rings phones have long made,
 * and melodies nobody owns (Beethoven's, the Westminster chimes) that phones have long rung with; and
 * jazz, written for Lighthouse (a famous tune is someone's, as a phone maker's own ringtone is, so
 * none is copied here). Each plays once in `every` ms.
 */
const TONES = {
  classic: { label: "Classic", every: 6000, play: (ctx, at) => tone(ctx, at, [440, 480], 2) },
  british: {
    label: "British double ring", every: 3000,
    play: (ctx, at) => {
      tone(ctx, at, [400, 450], 0.4);
      tone(ctx, at + 0.6, [400, 450], 0.4);
    },
  },
  bell: {
    label: "Old telephone bell", every: 4000,
    // A hammer between two bells, twenty strikes a second.
    play: (ctx, at) => {
      for (let i = 0; i < 36; i++) tone(ctx, at + i * 0.05, i % 2 ? [1180, 2650] : [1260, 2830], 0.12, { struck: true, vol: 0.07 });
    },
  },
  digital: {
    label: "Digital", every: 2600,
    play: (ctx, at) => {
      for (let i = 0; i < 8; i++) tone(ctx, at + i * 0.11 + (i >= 4 ? 0.25 : 0), [1400], 0.07, { type: "square", vol: 0.08 });
    },
  },
  marimba: {
    label: "Marimba", every: 3200,
    play: (ctx, at) => melody(ctx, at, [["C5", 1], ["G5", 1], ["E5", 1], ["G5", 1], ["C6", 1], ["G5", 1], ["A5", 1], ["G5", 2]], 0.15, { struck: true, vol: 0.16 }),
  },
  westminster: {
    label: "Westminster chimes", every: 8000,
    play: (ctx, at) => melody(ctx, at, [["Gs4", 1], ["Fs4", 1], ["E4", 1], ["B3", 2], ["E4", 1], ["Gs4", 1], ["Fs4", 1], ["B3", 2]], 0.55, { struck: true, vol: 0.14 }),
  },
  elise: {
    label: "Für Elise", every: 4200,
    play: (ctx, at) => melody(ctx, at, [["E5", 1], ["Ds5", 1], ["E5", 1], ["Ds5", 1], ["E5", 1], ["B4", 1], ["D5", 1], ["C5", 1], ["A4", 3]], 0.18, { type: "triangle", vol: 0.14 }),
  },
  joy: {
    label: "Ode to Joy", every: 6000,
    play: (ctx, at) => melody(ctx, at, [["E4", 1], ["E4", 1], ["F4", 1], ["G4", 1], ["G4", 1], ["F4", 1], ["E4", 1], ["D4", 1], ["C4", 1], ["C4", 1], ["D4", 1], ["E4", 1], ["E4", 1.5], ["D4", 0.5], ["D4", 2]], 0.26, { type: "triangle", vol: 0.14 }),
  },
  jazzPiano: {
    label: "Jazz piano", every: 3600,
    // A swung ii–V–I in C: Dm9, G13, then Cmaj9 left to ring, each chord over its bass note.
    play: (ctx, at) => {
      const piano = { type: "triangle", struck: true, vol: 0.07 };
      hits(ctx, at, [[0, [50], 1.6], [1.33, [43], 1.6], [2.67, [48], 3.2]], 0.3, { ...piano, vol: 0.12 });
      hits(ctx, at, [[0, [65, 69, 72, 76], 0.7], [0.67, [65, 69, 72, 76], 0.35], [1.33, [65, 71, 76], 0.7], [2, [65, 71, 76], 0.35], [2.67, [64, 67, 71, 74], 3.2]], 0.3, piano);
    },
  },
  bossaNova: {
    label: "Bossa nova", every: 3200,
    // Two bars: the guitar's off-beat chords (Cmaj7, then Dm7 and G7) over a root-and-fifth bass, in eighths.
    play: (ctx, at) => {
      hits(ctx, at, [[0, [48], 2.8], [3, [43], 0.9], [4, [48], 2.8], [7, [43], 0.9], [8, [50], 2.8], [11, [45], 0.9], [12, [43], 2.8], [15, [50], 0.9]], 0.16, { struck: true, vol: 0.16 });
      hits(ctx, at, [[0, [55, 59, 64], 1.4], [3, [55, 59, 64], 1.4], [6, [55, 59, 64], 1.4], [10, [57, 60, 65], 1.4], [13, [53, 59, 62], 1.4]], 0.16,
        { type: "triangle", struck: true, vol: 0.06, lowpass: 2400 });
    },
  },
  smoothSax: {
    label: "Smooth sax", every: 3800,
    // A blues lick in F, swung: up through the blue note to C, down, and home.
    play: (ctx, at) => hits(ctx, at, [[0, [65], 0.55], [0.67, [68], 0.3], [1, [69], 0.5], [1.5, [72], 1], [2.67, [70], 0.3], [3, [69], 0.55], [3.67, [65], 0.3], [4.33, [67], 0.3], [4.67, [68], 0.3], [5, [65], 1.8]], 0.24,
      { type: "sawtooth", vol: 0.15, lowpass: 1500, vibrato: 18 }),
  },
};

/** The ringtones, for the phone's Settings: [key, label, ms each plays for]. */
export const RINGTONES = Object.entries(TONES).map(([k, t]) => [k, t.label, t.every]);

// The one picked, kept on this computer.
const RINGTONE_KEY = "lighthouse.phone.ringtone";
export function readRingtone() {
  try {
    const k = localStorage.getItem(RINGTONE_KEY);
    return TONES[k] ? k : "classic";
  } catch {
    return "classic";
  }
}
export function keepRingtone(k) {
  try {
    localStorage.setItem(RINGTONE_KEY, k);
  } catch {
    // Private browsing: it lasts until the page is closed.
  }
}

/** Play a ringtone over and over (once, with `once`) until stopped. Returns stop(). */
function playTone(key, { once = false } = {}) {
  const t = TONES[key] ?? TONES.classic;
  let ctx = null;
  let timer = null;
  const ring = () => {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        // The ringtone's own volume, every note through it.
        ctx.ringOut = ctx.createGain();
        ctx.ringOut.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      t.play(ctx, ctx.currentTime + 0.05);
    } catch {
      // No sound here: the screen still rings.
    }
  };
  ring();
  if (!once) timer = setInterval(ring, t.every);
  // Stopped (answered, declined, missed, another picked): faded out over a moment, not cut off mid-note.
  const stop = () => {
    clearInterval(timer);
    const c = ctx;
    ctx = null;
    if (!c) return;
    try {
      const now = c.currentTime;
      c.ringOut.gain.cancelScheduledValues(now);
      c.ringOut.gain.setValueAtTime(c.ringOut.gain.value, now);
      c.ringOut.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    } catch {
      // Already closed.
    }
    setTimeout(() => c.close?.().catch?.(() => {}), 400);
  };
  if (once) setTimeout(stop, t.every);
  return stop;
}

/**
 * The ring of a call coming in: the ringtone picked under the phone's
 * Settings (Classic, the US phone's two tones, unless another was), until
 * stopped. Made by the browser (Web Audio); silent when the bell's sound is
 * off. Returns stop().
 */
export function startRingtone() {
  if (!soundOn()) return () => {};
  return playTone(readRingtone());
}

/** A ringtone heard once, as it is picked under Settings (whether the bell's sound is on or not). Returns stop(). */
export const previewRingtone = (key) => playTone(key, { once: true });
