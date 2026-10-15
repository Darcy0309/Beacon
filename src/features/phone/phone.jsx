"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight, ChevronDown, CircleDot, Clock, Delete, GripHorizontal, Grid3x3, MicOff, Pause, Phone, PhoneIncoming,
  PhoneMissed, PhoneOff, PhoneOutgoing,
} from "lucide-react";
import Link from "@/components/shared/intent-link";
import { createClient } from "@/lib/supabase/client";
import { KEYS, callClock, dialable, formatDial, numberOfTel, searchDigits, telOf } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { deviceLine } from "@/features/phone/lines";
import { closeCallNotification, showCallNotification, startRingtone } from "@/features/phone/incoming";

const PhoneContext = createContext(null);

/** The phone, for anything that wants to open it: { openPhone({ number, leadId, call }), ring({ number }) }. */
export const usePhone = () => useContext(PhoneContext);

// Where the phone's window was moved to, in this browser: { x, y } from the top left, or none (docked in the corner).
const POS_KEY = "lighthouse.phone.position";
const readPos = () => {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
};
const keepPos = (p) => {
  try {
    if (p) localStorage.setItem(POS_KEY, JSON.stringify(p));
    else localStorage.removeItem(POS_KEY);
  } catch {
    // Storage off: it stays where it is until the page is left.
  }
};
// The window's margin from the screen's edges, and how far an arrow key moves it.
const EDGE = 8;
const STEP = 24;
// How long a call coming in rings before it is missed, and how long a test call waits to ring.
const RING_MS = 30_000;
const TEST_DELAY_MS = 5_000;
// A test call's number when no call has been made yet.
const TEST_NUMBER = "6025550100";

// The calls made and taken in this browser, newest first: a convenience for calling back, kept here only.
// Each { number, leadId, co, at, ms, dir: "out" | "in", missed?, declined?, test? }.
const RECENT_KEY = "lighthouse.phone.recent";
const readRecent = () => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.slice(0, 15) : [];
  } catch {
    return [];
  }
};
const keepRecent = (list) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 15)));
  } catch {
    // Storage off (a private window): the list lasts as long as the page.
  }
};

// What on the window does something when pressed, so a drag never starts there.
const PRESSABLE = "button, a, input, textarea, select, label, [role=button]";

/**
 * The phone in Lighthouse (Oct 2026), on every page for the staff: a keypad
 * and number, the lead the number belongs to, the call with its timer, its
 * controls, the calls made and taken lately, and a call coming in, ringing,
 * to answer or decline here or on the desktop notification. Every phone link
 * in the workspace (a lead's Call buttons, a number in a list) opens it and
 * calls. Its window is dragged anywhere by any part of it that is not a
 * button or the number.
 *
 * Calls go through a line (lines.js). Today's is the computer's own calling
 * app, PanTerra's Streams when it is the default for phone links: Lighthouse
 * hands it the number and keeps the time, but cannot hear the call, so mute,
 * hold, tones and recording stay off, and calls coming in ring in Streams,
 * until a PanTerra line connects. A test call shows how a call coming in
 * rings, meanwhile.
 *
 * `tracked`: an account manager or agent, whose calls count as time worked
 * (the activity tracker counts a phone link pressed; a number dialed here is
 * reported the same way).
 */
export function PhoneProvider({ children, tracked = false }) {
  const line = deviceLine;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("keypad");
  const [value, setValue] = useState("");
  const [lead, setLead] = useState(null); // { id, co, contact, city } or null
  const leadRef = useRef(null); // the same, for a missed call recorded later by its timer
  const [checked, setChecked] = useState(null); // the digits whose lookup has answered
  const lookingUp = useRef(null); // the digits being looked up (a ref: setting it must not run the lookup again)
  const [call, setCall] = useState(null); // { number, lead, startedAt, endedAt, dir, test }
  const [ringing, setRinging] = useState(null); // a call coming in: { id, number, test }
  const ringingRef = useRef(null);
  const stopRing = useRef(null);
  const missTimer = useRef(null);
  const [testIn, setTestIn] = useState(null); // when a test call will ring
  const testTimer = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [controls, setControls] = useState({ muted: false, held: false, recording: false, keys: false });
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const active = Boolean(call && !call.endedAt);
  // The window: docked in the corner (pos null), or wherever it was dragged; always docked on a small screen.
  const [pos, setPos] = useState(null);
  const [small, setSmall] = useState(false);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef(null);
  const drag = useRef(null);
  const placed = pos && !small;

  useEffect(() => {
    setRecent(readRecent());
    setPos(readPos());
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setSmall(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Kept on the screen: as it is dragged, when the window grows (Recent, the call's controls), and when the screen shrinks.
  const clamp = useCallback((p) => {
    const el = panelRef.current;
    const w = el?.offsetWidth ?? 320;
    const h = el?.offsetHeight ?? 480;
    return {
      x: Math.round(Math.min(Math.max(EDGE, p.x), Math.max(EDGE, window.innerWidth - w - EDGE))),
      y: Math.round(Math.min(Math.max(EDGE, p.y), Math.max(EDGE, window.innerHeight - h - EDGE))),
    };
  }, []);
  useEffect(() => {
    if (!open || !placed) return;
    const fit = () => setPos((p) => (p ? clamp(p) : p));
    const ro = new ResizeObserver(fit);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [open, placed, clamp]);

  const moveTo = useCallback((p) => {
    const next = clamp(p);
    setPos(next);
    keepPos(next);
  }, [clamp]);
  const dock = useCallback(() => {
    setPos(null);
    keepPos(null);
  }, []);

  // Dragged by any part of the window that is not pressed for something else (a button, the number, a link),
  // nor a list's scroll bar; double-clicking its title bar docks it again.
  const onDragStart = (e) => {
    if (small || e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Element) || t.closest(PRESSABLE)) return;
    if (t.clientWidth && t.scrollHeight > t.clientHeight && e.nativeEvent.offsetX > t.clientWidth) return;
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    e.preventDefault();
  };
  const onDragMove = (e) => {
    if (!drag.current) return;
    setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }));
  };
  const onDragEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    setPos((p) => {
      keepPos(p);
      return p;
    });
  };
  // The arrow keys move it from the grip, a step at a time (three with Shift).
  const onGripKey = (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || small) return;
    e.preventDefault();
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    const n = e.shiftKey ? STEP * 3 : STEP;
    moveTo({ x: r.left + d[0] * n, y: r.top + d[1] * n });
  };

  // Messages popping up in the corner move aside while the phone is open there (globals.css).
  useEffect(() => {
    const docked = open && !placed;
    document.documentElement.toggleAttribute("data-phone-open", docked);
    return () => document.documentElement.removeAttribute("data-phone-open");
  }, [open, placed]);

  // The call's timer.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // The lead a full number belongs to, looked up once per number (Row Level Security decides which).
  const dialed = active ? call.number : ringing ? ringing.number : value;
  useEffect(() => {
    const digits = searchDigits(dialed);
    if (!digits) {
      if (!active) setLead(null);
      return;
    }
    if (lookingUp.current === digits) return;
    lookingUp.current = digits;
    let gone = false;
    fetch(`/api/lead-options?q=${digits}`)
      .then((r) => (r.ok ? r.json() : { leads: [] }))
      .then(({ leads }) => {
        if (gone) return;
        setLead((was) => {
          // A Call button names its lead: keep it if the search found it, else take the first.
          const named = was?.id ? leads?.find((l) => l.id === was.id) : null;
          return named ?? (was?.id && !leads?.length ? was : leads?.[0] ?? null);
        });
        setChecked(digits);
      })
      .catch(() => {});
    return () => {
      // A newer number (or the call starting) asks again.
      gone = true;
      lookingUp.current = null;
    };
  }, [dialed, active]);

  useEffect(() => {
    leadRef.current = lead;
  }, [lead]);

  const remember = useCallback((entry) => {
    setRecent((list) => {
      const next = [entry, ...list].slice(0, 15);
      keepRecent(next);
      return next;
    });
  }, []);

  const report = useCallback(
    (leadId) => {
      if (!tracked) return;
      createClient().rpc("track_activity", { p_kind: "call", p_lead: leadId ?? null }).then(() => {}, () => {});
    },
    [tracked]
  );

  const startCall = useCallback(
    (number, who, { fromLink = false } = {}) => {
      const tel = telOf(number);
      if (!tel || ringingRef.current) return;
      line.call(tel);
      // A phone link pressed is already reported by the activity tracker; one dialed here is reported now.
      if (!fromLink) report(who?.id);
      setControls({ muted: false, held: false, recording: false, keys: false });
      setCall({ number: dialable(number), lead: who ?? null, startedAt: Date.now(), endedAt: null, dir: "out" });
      setNow(Date.now());
    },
    [line, report]
  );

  const endCall = useCallback(() => {
    if (!call || call.endedAt) return;
    if (!call.test) line.hangUp();
    const endedAt = Date.now();
    setCall((c) => ({ ...c, endedAt }));
    remember({
      number: call.number, leadId: call.lead?.id ?? lead?.id ?? null, co: call.lead?.co ?? lead?.co ?? null,
      at: call.startedAt, ms: endedAt - call.startedAt, dir: call.dir ?? "out", test: call.test || undefined,
    });
  }, [call, lead, line, remember]);

  // A call coming in: rings here (and on the desktop) until answered, declined, or missed after RING_MS.
  const stopRinging = useCallback((id) => {
    stopRing.current?.();
    stopRing.current = null;
    clearTimeout(missTimer.current);
    closeCallNotification(id);
    ringingRef.current = null;
    setRinging(null);
  }, []);

  const finishRing = useCallback(
    (outcome) => {
      const r = ringingRef.current;
      if (!r) return;
      if (outcome === "declined" && !r.test) line.decline(r.id);
      stopRinging(r.id);
      const who = leadRef.current;
      remember({
        number: r.number, leadId: who?.id ?? null, co: who?.co ?? null, at: r.at, ms: 0, dir: "in",
        missed: outcome === "missed" || undefined, declined: outcome === "declined" || undefined, test: r.test || undefined,
      });
    },
    [line, remember, stopRinging]
  );

  const answer = useCallback(() => {
    const r = ringingRef.current;
    if (!r) return;
    if (!r.test) line.answer(r.id);
    stopRinging(r.id);
    setControls({ muted: false, held: false, recording: false, keys: false });
    setCall({ number: r.number, lead, startedAt: Date.now(), endedAt: null, dir: "in", test: r.test });
    setNow(Date.now());
    setTab("keypad");
    setOpen(true);
  }, [line, lead, stopRinging]);
  const decline = useCallback(() => finishRing("declined"), [finishRing]);

  const ring = useCallback(
    ({ id = Date.now().toString(36), number, test = false }) => {
      // One call at a time: a call coming in during another is left to the line (busy, or its voicemail).
      if (ringingRef.current || (call && !call.endedAt)) return;
      const r = { id: String(id), number: dialable(number), test, at: Date.now() };
      ringingRef.current = r;
      setRinging(r);
      setLead(null);
      setChecked(null);
      setTab("keypad");
      setOpen(true);
      stopRing.current?.();
      stopRing.current = startRingtone();
      showCallNotification({ id: r.id, title: test ? "Incoming call (test)" : "Incoming call", body: formatDial(r.number) }, () => setOpen(true));
      clearTimeout(missTimer.current);
      missTimer.current = setTimeout(() => finishRing("missed"), RING_MS);
    },
    [call, finishRing]
  );

  // Calls coming in on the line (none on today's; a PanTerra line rings here).
  useEffect(() => line.onIncoming((c) => ring({ id: c.id, number: c.number })), [line, ring]);

  // Answer and Decline pressed on the desktop notification (public/sw.js passes them on).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e) => {
      if (e.data?.type !== "lighthouse:call") return;
      const r = ringingRef.current;
      if (r && r.id === String(e.data.id)) {
        if (e.data.action === "answer") answer();
        else if (e.data.action === "decline") decline();
        else setOpen(true);
      } else if (e.data.action !== "decline") setOpen(true);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [answer, decline]);

  // A test call: rings after a few seconds, so there is time to look away and see the desktop notification too.
  const testCall = useCallback(() => {
    clearTimeout(testTimer.current);
    setTestIn(Date.now() + TEST_DELAY_MS);
    testTimer.current = setTimeout(() => {
      setTestIn(null);
      ring({ number: recent[0]?.number || TEST_NUMBER, test: true });
    }, TEST_DELAY_MS);
  }, [recent, ring]);
  const cancelTest = useCallback(() => {
    clearTimeout(testTimer.current);
    setTestIn(null);
  }, []);
  useEffect(() => () => {
    clearTimeout(testTimer.current);
    clearTimeout(missTimer.current);
    stopRing.current?.();
  }, []);

  /** Open the phone on a number (and its lead); `call`: dial it at once. */
  const openPhone = useCallback(
    ({ number = "", leadId = null, call: dialNow = false, fromLink = false } = {}) => {
      if (active || ringingRef.current) {
        // One call at a time: show the one going on, or ringing.
        setOpen(true);
        setTab("keypad");
        return;
      }
      const v = dialable(number);
      const who = leadId ? { id: leadId } : null;
      setValue(v);
      setLead(who);
      setChecked(null);
      setTab("keypad");
      setOpen(true);
      if (dialNow && v) startCall(v, who, { fromLink });
    },
    [active, startCall]
  );

  // Every phone link in the workspace opens the phone and calls: the number, and the lead it is on.
  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href^="tel:"]') : null;
      if (!a || a.closest("[data-phone-dock], [data-phone-window]")) return;
      e.preventDefault();
      const leadId = Number(a.closest("[data-lead-id]")?.getAttribute("data-lead-id"));
      openPhone({ number: numberOfTel(a.getAttribute("href")), leadId: Number.isInteger(leadId) && leadId > 0 ? leadId : null, call: true, fromLink: true });
    };
    // Bubbling, after the activity tracker (capturing) has counted the press.
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openPhone]);

  const press = useCallback(
    (key) => {
      if (active) {
        if (line.can.tones) line.tone(key);
        return;
      }
      setValue((v) => dialable(v + key));
      inputRef.current?.focus();
    },
    [active, line]
  );

  // The keyboard, while the phone is open and nothing else is being typed in.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !t.hasAttribute("data-phone-number");
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        // Only from inside the phone: Escape elsewhere is a dialog's or a menu's.
        if (t instanceof Element && t.closest("[data-phone-dock], [data-phone-window]")) setOpen(false);
        return;
      }
      if (ringingRef.current || t?.hasAttribute?.("data-phone-number")) return; // ringing: its buttons; the number: its own keys
      if (/^[\d*#]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace" && !active) {
        e.preventDefault();
        setValue((v) => v.slice(0, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (active) endCall();
        else if (value) startCall(value, lead);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, active, value, lead, press, startCall, endCall]);

  const context = useMemo(() => ({ openPhone, ring, active }), [openPhone, ring, active]);
  const who = call?.lead?.co ? call.lead : lead;
  const callLabel = call?.test ? "Test call" : call?.dir === "in" ? "On the call" : "In your calling app";

  return (
    <PhoneContext.Provider value={context}>
      {children}
      {open ? (
        // The phone's window: over the page but not in its way (the page stays usable during a call), dragged
        // anywhere by any part of it that is not a button, docked above the phone button until it is.
        <div data-phone-window data-placed={placed ? "" : undefined}
          className={cn("fixed z-40 print:hidden", !placed && "bottom-[5.25rem] right-4")}
          style={placed ? { left: pos.x, top: pos.y } : undefined}>
          <section ref={panelRef} aria-label="Phone" data-phone-panel
            onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
            title={small ? undefined : "Drag anywhere to move it"}
            className={cn("animate-pop-in flex w-[20rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-card shadow-[0_24px_70px_-20px_rgb(0_0_0/0.55)]",
              placed ? "max-h-[calc(100svh-1rem)]" : "max-h-[calc(100svh-6.5rem)]",
              !small && "touch-none [&_a]:cursor-pointer [&_button:not(:disabled)]:cursor-pointer [&_input]:cursor-text",
              !small && (dragging ? "cursor-grabbing select-none ring-2 ring-primary/40" : "cursor-grab"))}>
            <header onDoubleClick={(e) => { if (!(e.target instanceof Element && e.target.closest(PRESSABLE))) dock(); }}
              data-phone-bar title={small ? undefined : "Drag anywhere to move · double-click here to put it back in the corner"}
              className="flex items-center justify-between gap-2 border-b border-[var(--panel-border)] px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                {!small ? (
                  <button type="button" onKeyDown={onGripKey} aria-label="Move the phone: use the arrow keys" title="Drag the window to move it, or use the arrow keys here" data-phone-grip
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <GripHorizontal className="size-4" />
                  </button>
                ) : null}
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Phone</div>
                  <div className="truncate text-[0.66rem] text-muted-foreground" title={line.note} data-phone-line={line.id}>{line.label}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {placed ? (
                  <button type="button" onClick={dock} aria-label="Put the phone back in the corner" title="Back to the corner" data-phone-dock-back
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <ArrowDownRight className="size-4" />
                  </button>
                ) : null}
                {[["keypad", "Keypad", Grid3x3], ["recent", "Recent", Clock]].map(([k, label, Icon]) => (
                  <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} aria-label={label} title={label} data-phone-tab={k}
                    className={cn("rounded-md p-1.5 transition-colors", tab === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                    <Icon className="size-4" />
                  </button>
                ))}
                <button type="button" onClick={() => setOpen(false)} aria-label="Minimize the phone" title="Minimize" data-phone-close
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <ChevronDown className="size-4" />
                </button>
              </div>
            </header>

            {ringing ? (
              // A call coming in: who, and Answer or Decline.
              <div className="flex flex-col items-center px-4 pb-6 pt-5 text-center" data-phone-ringing={ringing.test ? "test" : ""} aria-live="assertive">
                <span className="flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-emerald-500">
                  <PhoneIncoming className="size-3.5 animate-pulse" /> Incoming call{ringing.test ? " · test" : ""}
                </span>
                <div className="mt-3 text-2xl font-semibold tabular-nums" data-phone-caller>{formatDial(ringing.number)}</div>
                <div className="mt-1 min-h-[1.25rem] text-xs">
                  {lead?.co ? (
                    <Link href={`/leads/${lead.id}`} className="font-medium text-primary hover:underline" data-phone-lead={lead.id}>{lead.co}</Link>
                  ) : checked === searchDigits(ringing.number) && searchDigits(ringing.number) ? (
                    <span className="text-muted-foreground" data-phone-lead="">No lead with this number</span>
                  ) : null}
                  {lead?.contact ? <span className="text-muted-foreground"> · {lead.contact}</span> : null}
                </div>
                <div className="mt-6 flex items-start justify-center gap-12">
                  <button type="button" onClick={decline} aria-label="Decline the call" data-phone-decline className="group flex flex-col items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <span className="flex size-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_0_18px_-6px_rgb(244_63_94)] transition-transform group-hover:scale-105 group-active:scale-95">
                      <PhoneOff className="size-6" />
                    </span>
                    Decline
                  </button>
                  <button type="button" onClick={answer} aria-label="Answer the call" data-phone-answer className="group flex flex-col items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <span className="flex size-14 animate-pulse items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_18px_-6px_var(--neon-emerald)] transition-transform group-hover:scale-105 group-active:scale-95">
                      <Phone className="size-6" />
                    </span>
                    Answer
                  </button>
                </div>
                {ringing.test ? <p className="mt-4 text-[0.66rem] text-muted-foreground">A test: nobody is on the line.</p> : null}
              </div>
            ) : tab === "recent" ? (
              <Recent list={recent} disabled={active} onPick={(r) => { setValue(r.number); setLead(r.leadId ? { id: r.leadId, co: r.co } : null); setChecked(null); setTab("keypad"); }}
                onCall={(r) => { setValue(r.number); setTab("keypad"); startCall(r.number, r.leadId ? { id: r.leadId, co: r.co } : null); }} />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-3">
                {/* The number, typed or pressed; Enter calls. */}
                <div className="flex items-center gap-1">
                  <input ref={inputRef} data-phone-number value={formatDial(active ? call.number : value)} readOnly={active}
                    onChange={(e) => setValue(dialable(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (active) endCall();
                        else if (value) startCall(value, lead);
                      }
                    }}
                    inputMode="tel" autoComplete="off" placeholder="Enter a number" aria-label="Number to call"
                    className="min-w-0 flex-1 bg-transparent py-1 text-center text-2xl font-semibold tabular-nums tracking-wide outline-none placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground" />
                  {!active && value ? (
                    <button type="button" onClick={() => setValue((v) => v.slice(0, -1))} aria-label="Delete the last digit" data-phone-backspace
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <Delete className="size-5" />
                    </button>
                  ) : null}
                </div>

                {/* Whose number it is, and where the call stands. */}
                <div className="mt-1 min-h-[2.5rem] text-center text-xs" aria-live="polite">
                  {who?.co ? (
                    <Link href={`/leads/${who.id}`} className="font-medium text-primary hover:underline" data-phone-lead={who.id}>{who.co}</Link>
                  ) : searchDigits(dialed) && checked === searchDigits(dialed) ? (
                    <span className="text-muted-foreground" data-phone-lead="">No lead with this number</span>
                  ) : null}
                  {who?.contact ? <span className="text-muted-foreground"> · {who.contact}</span> : null}
                  <div className={cn("mt-0.5 font-medium tabular-nums", active ? "text-emerald-500" : "text-muted-foreground")} data-phone-status={call ? (active ? "active" : "ended") : "idle"}>
                    {active ? `${callLabel} · ${callClock(now - call.startedAt)}` : call ? `Call ended · ${callClock(call.endedAt - call.startedAt)}` : "Ready"}
                  </div>
                </div>

                {active && !controls.keys ? (
                  // During a call: what the line can do; the rest off, saying why.
                  <div className="mt-2 grid grid-cols-4 gap-2" data-phone-controls>
                    {[["mute", "Mute", MicOff, "muted"], ["hold", "Hold", Pause, "held"], ["tones", "Keypad", Grid3x3, "keys"], ["record", "Record", CircleDot, "recording"]].map(([cap, label, Icon, key]) => {
                      const can = line.can[cap];
                      const on = controls[key];
                      return (
                        <button key={cap} type="button" disabled={!can} aria-pressed={can ? on : undefined} data-phone-control={cap}
                          title={can ? label : `${label}: comes with the PanTerra connection`}
                          onClick={() => {
                            setControls((c) => ({ ...c, [key]: !c[key] }));
                            if (cap === "mute") line.setMuted(!on);
                            if (cap === "hold") line.setHeld(!on);
                            if (cap === "record") line.setRecording(!on);
                          }}
                          className={cn("flex flex-col items-center gap-1 rounded-xl py-2 text-[0.66rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                            on ? (cap === "record" ? "bg-rose-500/15 text-rose-500" : "bg-primary/15 text-primary") : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                          <Icon className={cn("size-5", cap === "record" && on && "animate-pulse")} />
                          {label}
                        </button>
                      );
                    })}
                    {!line.can.record ? (
                      <p className="col-span-4 text-center text-[0.66rem] text-muted-foreground" data-phone-line-note>
                        Mute, hold, keypad tones and recording come with the PanTerra connection.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-3 gap-2" data-phone-keypad>
                    {KEYS.map(([k, letters]) => (
                      <button key={k} type="button" onClick={() => press(k)} aria-label={k} data-phone-key={k} disabled={active && !line.can.tones}
                        className="flex h-14 flex-col items-center justify-center rounded-full border border-[var(--panel-border)] bg-background/40 transition-colors hover:border-primary/40 hover:bg-primary/10 active:scale-95 disabled:opacity-40">
                        <span className="text-xl font-semibold leading-none tabular-nums">{k}</span>
                        <span className="mt-0.5 h-3 text-[0.55rem] font-semibold tracking-[0.18em] text-muted-foreground">{letters}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Call, or end the call. */}
                <div className="mt-3 flex items-center justify-center gap-4">
                  {active ? (
                    <button type="button" onClick={endCall} aria-label="End the call" data-phone-end
                      className="flex size-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_0_18px_-6px_rgb(244_63_94)] transition-transform hover:scale-105 active:scale-95">
                      <PhoneOff className="size-6" />
                    </button>
                  ) : (
                    <button type="button" onClick={() => startCall(value, lead)} disabled={!telOf(value)} aria-label="Call" data-phone-call
                      className="flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_18px_-6px_var(--neon-emerald)] transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40">
                      <Phone className="size-6" />
                    </button>
                  )}
                </div>
                {call && !active && (call.lead?.id ?? lead?.id) ? (
                  // The call over: its result goes on the lead (named when it began, or found while it went on).
                  <Link href={`/leads/${call.lead?.id ?? lead.id}`} className="mt-3 text-center text-xs font-semibold text-primary hover:underline" data-phone-result>
                    Record the call&apos;s result on the lead
                  </Link>
                ) : null}

                {/* How a call coming in rings, until a PanTerra line brings real ones. */}
                {!active && !line.can.receive ? (
                  <div className="mt-3 border-t border-[var(--panel-border)] pt-2 text-center text-[0.66rem] text-muted-foreground">
                    {testIn ? (
                      <span data-phone-test-pending>
                        A test call rings in a few seconds: look at another window to see it on the desktop too.{" "}
                        <button type="button" onClick={cancelTest} className="font-semibold text-primary hover:underline">Cancel</button>
                      </span>
                    ) : (
                      <span>
                        Calls coming in ring in your calling app for now.{" "}
                        <button type="button" onClick={testCall} className="font-semibold text-primary hover:underline" data-phone-test-call>Try a test call</button>
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      ) : null}

      <div data-phone-dock className="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 print:hidden">
        {/* The phone button: a call ringing, or going on, shows here. */}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          aria-label={ringing ? "A call is coming in: show it" : open ? "Minimize the phone" : active ? "Show the call" : "Open the phone"} data-phone-button
          className={cn("pointer-events-auto flex h-14 items-center justify-center gap-2 rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95",
            ringing ? "animate-bounce bg-emerald-500 px-5" : active ? "bg-emerald-500 px-5" : "w-14 bg-primary text-primary-foreground")}>
          {ringing ? <PhoneIncoming className="size-6" /> : <Phone className={cn("size-6", active && "animate-pulse")} />}
          {ringing ? <span className="text-sm font-semibold" data-phone-button-ringing>Incoming</span>
            : active ? <span className="text-sm font-semibold tabular-nums" data-phone-timer>{callClock(now - call.startedAt)}</span> : null}
        </button>
      </div>
    </PhoneContext.Provider>
  );
}

/** The calls made and taken lately in this browser: who, which way, when, how long; one picked fills the keypad, the button calls back. */
function Recent({ list, disabled, onPick, onCall }) {
  if (!list.length) return <p className="px-4 py-10 text-center text-sm text-muted-foreground" data-phone-recent>No calls yet.</p>;
  return (
    <ul className="min-h-0 flex-1 divide-y divide-[var(--panel-border)] overflow-y-auto" data-phone-recent>
      {list.map((r) => {
        const missed = r.missed || r.declined;
        const Icon = missed ? PhoneMissed : r.dir === "in" ? PhoneIncoming : PhoneOutgoing;
        return (
          <li key={`${r.at}-${r.number}`} className="flex items-center gap-2 px-4 py-2.5" data-phone-recent-row data-dir={r.dir ?? "out"} data-outcome={r.missed ? "missed" : r.declined ? "declined" : "talked"}>
            <Icon className={cn("size-4 shrink-0", missed ? "text-rose-500" : "text-muted-foreground")} aria-hidden />
            <button type="button" onClick={() => onPick(r)} className="min-w-0 flex-1 text-left">
              <div className={cn("truncate text-sm font-medium", missed && "text-rose-500")}>{r.co ?? formatDial(r.number)}</div>
              <div className="truncate text-[0.7rem] text-muted-foreground tabular-nums">
                {r.co ? `${formatDial(r.number)} · ` : ""}
                {new Date(r.at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {" · "}{r.missed ? "Missed" : r.declined ? "Declined" : callClock(r.ms)}{r.test ? " · test" : ""}
              </div>
            </button>
            <button type="button" onClick={() => onCall(r)} disabled={disabled} aria-label={`Call ${r.co ?? formatDial(r.number)}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-transform hover:scale-105 disabled:opacity-40">
              <Phone className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
