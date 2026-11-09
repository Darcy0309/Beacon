"use client";

// Talk to type (Sean, Nov 2026): the browser's own speech recognition (Chrome and Edge; Safari's,
// less steady, which stops after a pause), for the lead's notes and the search. Nothing to set up or
// pay for; where the browser has none, there is no button. The words come as they are heard: what is
// said so far, the last of it still settling, then fixed.

import { useCallback, useEffect, useRef, useState } from "react";

const Recognition = () => (typeof window === "undefined" ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null);

/** Why talking to type stopped, said plainly; null for a stop that needs no word (silence, Stop pressed). */
export function dictationError(code) {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Lighthouse needs your microphone to type what you say: allow it in the browser's address bar, then press the mic again.";
  }
  if (code === "audio-capture") return "No microphone was found. Plug one in, or choose it in your computer's sound settings.";
  if (code === "network") return "Talk to type needs the internet: the browser sends what you say to be written out. Check the connection and try again.";
  if (code === "language-not-supported") return "This browser can't write out spoken English.";
  return null;
}

/**
 * Talking to type: { supported, listening, start(onText), stop }. `onText(text, final)` is called as
 * words are heard, with everything said since start (the words still settling at its end), `final`
 * once they are fixed; `onError(message)` when it stops for a reason worth saying. Listening goes on
 * until stop(), or the field goes away: a browser that stops by itself after a pause (Safari, Chrome
 * after a long one) is started again, the words so far kept.
 */
export function useDictation({ onError } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  const wanted = useRef(false);
  const said = useRef(""); // fixed so far, across restarts
  const handler = useRef(null);
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  // Only known in the browser: checked once there, so the page renders the same on the server.
  useEffect(() => setSupported(Boolean(Recognition())), []);

  const stop = useCallback(() => {
    wanted.current = false;
    try {
      rec.current?.stop();
    } catch {
      // Already stopped.
    }
    setListening(false);
  }, []);

  const begin = useCallback(() => {
    const R = Recognition();
    if (!R) return;
    const r = new R();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let fixed = "";
      let settling = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) fixed += t;
        else settling += t;
      }
      const join = (a, b) => (a && b ? `${a.replace(/\s+$/, "")} ${b.replace(/^\s+/, "")}` : a || b).trim();
      const sessionFixed = join(said.current, fixed);
      handler.current?.(join(sessionFixed, settling), !settling);
      // Kept for a restart: this session's fixed words join what came before.
      r.__fixed = sessionFixed;
    };
    r.onerror = (e) => {
      const message = dictationError(e.error);
      if (message) {
        wanted.current = false;
        errorRef.current?.(message);
      }
    };
    r.onend = () => {
      said.current = r.__fixed ?? said.current;
      if (wanted.current) {
        // Stopped by itself (a pause, a time limit): on again, the words so far kept.
        try {
          begin();
          return;
        } catch {
          wanted.current = false;
        }
      }
      setListening(false);
    };
    rec.current = r;
    r.start();
  }, []);

  const start = useCallback(
    (onText) => {
      if (!Recognition()) return;
      handler.current = onText;
      said.current = "";
      wanted.current = true;
      setListening(true);
      try {
        begin();
      } catch {
        wanted.current = false;
        setListening(false);
      }
    },
    [begin]
  );

  // The field gone (the dialog closed, the page left): listening ends with it.
  useEffect(() => () => {
    wanted.current = false;
    try {
      rec.current?.abort();
    } catch {
      // Nothing to stop.
    }
  }, []);

  return { supported, listening, start, stop };
}
