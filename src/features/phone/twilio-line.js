"use client";

// The Twilio line (Nov 2026): calls made and taken in the browser itself,
// through Twilio Voice, with the computer's microphone and speakers. The same
// shape as the device line (lines.js), with everything switched on but hold.
// Calls out go through the TwiML App to app/api/twilio/voice, which dials the
// number from the Twilio number; calls to that number ring every browser with
// the phone open. Only when the server has Twilio's keys: until then
// createTwilioLine() gives null and the phone keeps the device line.

import { toast } from "sonner";

/** This browser's calling token from the server, or null when Twilio is not set up (or not for this person). */
async function fetchToken() {
  const res = await fetch("/api/phone/token", { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json())?.token ?? null;
}

// What a failed call says, by Twilio's error code; anything else, Twilio's own words.
const MICROPHONE = [31208, 31401, 31402, 53405];
// A token Twilio will not take: the server's Twilio keys are wrong (or for another account).
const KEYS_WRONG = [20101, 20102, 20103, 20105, 20106, 20107, 31202, 31203, 31204, 31205, 31206, 31207];
const sayWhy = (err) =>
  MICROPHONE.includes(err?.code)
    ? "The phone needs your microphone: allow it for Lighthouse in the browser's address bar, then call again."
    : KEYS_WRONG.includes(err?.code)
      ? "Twilio did not accept Lighthouse's calling keys: an administrator needs to run the Twilio setup again."
      : err?.message || "The call could not go through.";

// Why this browser can't take calls coming in: Twilio would not register it. With Twilio's own code and words,
// so whoever sees it can say what it was.
const whyNotReceiving = (err) => {
  const detail = [err?.code, err?.description || err?.message || err?.name].filter(Boolean).join(" ");
  if (KEYS_WRONG.includes(err?.code)) return `Twilio did not accept Lighthouse's calling keys: an administrator needs to run the Twilio setup again (${detail}).`;
  if ([31000, 31005, 31009, 53000, 53001].includes(err?.code) || /network|websocket|transport|timed? ?out/i.test(detail)) {
    return `this computer can't reach Twilio; a firewall, VPN or ad blocker may be in the way${detail ? ` (${detail})` : ""}.`;
  }
  return `Twilio would not connect${detail ? ` (${detail})` : ""}.`;
};

/**
 * The Twilio line, ready to call and to ring; null when the server has no
 * Twilio keys. `destroy()` lets go of it (the phone leaving the page).
 */
export async function createTwilioLine() {
  const token = await fetchToken();
  if (!token) return null;
  // Loaded only here, so the browsers of people without the line never fetch it.
  const { Device } = await import("@twilio/voice-sdk");
  const device = new Device(token, {
    closeProtection: "A call is on: leaving Lighthouse will hang it up.",
    codecPreferences: ["opus", "pcmu"],
    tokenRefreshMs: 60_000,
    logLevel: "error",
  });
  // The phone rings with its own tone (incoming.js).
  device.audio?.incoming(false);

  let current = null; // the call on: { id, call, hungUp }; call is null while it is still being placed
  const ringing = new Map(); // calls coming in, not yet answered: id (Twilio's CallSid) → Call
  const onRing = new Set();
  const onEnd = new Set();
  const onAnswer = new Set();
  const onStatus = new Set();

  // Whether calls coming in can ring this browser: { receiving, problem }. Only a browser registered with
  // Twilio is rung; once it is, the server counts this person in (phone_presence), and again with each new token.
  let status = { receiving: false, problem: null };
  const setStatus = (next) => {
    status = next;
    onStatus.forEach((h) => h(status));
  };
  const present = () =>
    fetch("/api/phone/token", { method: "POST" })
      .then((r) => (r.ok ? null : r.json().then((d) => Promise.reject(new Error(d?.error || `HTTP ${r.status}`)))))
      .then(
        () => setStatus({ receiving: true, problem: null }),
        (err) => setStatus({ receiving: false, problem: err.message || "Calls in could not be turned on for you." })
      );

  // A call over, hung up at the other end, cancelled while ringing, or failed: the phone is told once.
  const ended = (id) => {
    const known = current?.id === id || ringing.has(id);
    if (current?.id === id) current = null;
    ringing.delete(id);
    if (known) onEnd.forEach((h) => h({ id }));
  };
  const watch = (call, id) => {
    let answered = false;
    // Answered at the other end (calls out are bridged only then: answerOnBridge), or here.
    call.on("accept", () => {
      answered = true;
      onAnswer.forEach((h) => h({ id }));
    });
    for (const e of ["disconnect", "cancel", "reject"]) call.on(e, () => ended(id));
    call.on("error", (err) => {
      // Twilio hangs up a call out that is busy or not answered, and the browser hears it as a gateway error.
      if (err?.code === 31005 && !answered) toast("The call ended before it was answered: the number was busy or nobody picked up.");
      else toast.error(sayWhy(err));
      ended(id);
    });
  };

  // A new token shortly before the last runs out; still registered, still counted in.
  const renew = () =>
    fetchToken().then((t) => {
      if (!t) return;
      device.updateToken(t);
      if (device.state === "registered") present();
    }, () => {});
  device.on("tokenWillExpire", renew);
  device.on("registered", present);
  device.on("unregistered", () => setStatus({ receiving: false, problem: status.problem ?? "Twilio disconnected this browser; it reconnects by itself, or reload the page." }));
  device.on("error", (err) => {
    // An expired token (the computer asleep past its refresh): a new one, and on.
    if (err?.code === 20104) renew();
    else {
      console.warn("[phone] Twilio:", err?.code, err?.message);
      if (device.state !== "registered") setStatus({ receiving: false, problem: whyNotReceiving(err) });
    }
  });
  device.on("incoming", (call) => {
    if (current) return; // one call at a time: it rings the others, then voicemail
    const id = call.parameters.CallSid;
    ringing.set(id, call);
    watch(call, id);
    onRing.forEach((h) => h({ id, number: call.parameters.From }));
  });
  // Registered, it rings for calls coming in; calls out work without it.
  device.register().catch((err) => {
    console.warn("[phone] Twilio registration:", err?.code, err?.message ?? err);
    setStatus({ receiving: false, problem: whyNotReceiving(err) });
  });

  return {
    id: "twilio",
    label: "Lighthouse phone",
    note: "Calls go out from the company's number, from this browser: your microphone and speakers, or a headset.",
    lacks: "not on this line",
    can: { mute: true, hold: false, tones: true, record: true, receive: true, hangUp: true, answered: true },

    /** Call a tel: link's number; returns the call's id, which onEnded names when it ends. */
    call(tel) {
      const id = `out-${Date.now().toString(36)}`;
      const entry = { id, call: null, hungUp: false };
      current = entry;
      device.connect({ params: { To: tel } }).then(
        (call) => {
          // Ended here before it had connected: hang it up now.
          if (entry.hungUp) return call.disconnect();
          entry.call = call;
          watch(call, id);
        },
        (err) => {
          toast.error(sayWhy(err));
          ended(id);
        }
      );
      return id;
    },
    hangUp() {
      const entry = current;
      current = null; // ended here: the phone has already put it under Recent
      if (!entry) return;
      entry.hungUp = true;
      entry.call?.disconnect();
    },
    setMuted(on) {
      current?.call?.mute(Boolean(on));
    },
    setHeld() {},
    tone(key) {
      current?.call?.sendDigits(String(key));
    },
    /** Start or stop recording the call (app/api/phone/recording); rejects with why it could not. */
    async setRecording(on) {
      const callSid = current?.call?.parameters?.CallSid;
      if (!callSid) throw new Error("The call is not connected yet.");
      const res = await fetch("/api/phone/recording", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callSid, on: Boolean(on) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Recording could not be changed.");
    },
    onIncoming(handler) {
      onRing.add(handler);
      return () => onRing.delete(handler);
    },
    onEnded(handler) {
      onEnd.add(handler);
      return () => onEnd.delete(handler);
    },
    onAnswered(handler) {
      onAnswer.add(handler);
      return () => onAnswer.delete(handler);
    },
    /** Whether calls coming in ring here, now and as it changes: handler({ receiving, problem }). */
    onStatus(handler) {
      onStatus.add(handler);
      handler(status);
      return () => onStatus.delete(handler);
    },
    answer(id) {
      const call = ringing.get(id);
      if (!call) return;
      ringing.delete(id);
      current = { id, call, hungUp: false };
      call.accept();
    },
    decline(id) {
      const call = ringing.get(id);
      ringing.delete(id);
      call?.reject();
    },
    destroy() {
      onRing.clear();
      onEnd.clear();
      onAnswer.clear();
      onStatus.clear();
      device.destroy();
    },
  };
}
