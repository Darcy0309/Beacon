"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleDot, Clock, Delete, Grid3x3, MicOff, Pause, Phone, PhoneOff } from "lucide-react";
import Link from "@/components/shared/intent-link";
import { createClient } from "@/lib/supabase/client";
import { KEYS, callClock, dialable, formatDial, numberOfTel, searchDigits, telOf } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { deviceLine } from "@/features/phone/lines";

const PhoneContext = createContext(null);

/** The phone, for anything that wants to open it: { openPhone({ number, leadId, call }) }. */
export const usePhone = () => useContext(PhoneContext);

// The calls made from this browser, newest first: a convenience for redialing, kept here only.
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

/**
 * The phone in Lighthouse (Oct 2026), on every page for the staff: a keypad
 * and number, the lead the number belongs to, the call with its timer, its
 * controls, and the calls made lately. Every phone link in the workspace
 * (a lead's Call buttons, a number in a list) opens it and calls.
 *
 * Calls go through a line (lines.js). Today's is the computer's own calling
 * app, PanTerra's Streams when it is the default for phone links: Lighthouse
 * hands it the number and keeps the time, but cannot hear the call, so mute,
 * hold, tones and recording stay off until a PanTerra line connects.
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
  const [checked, setChecked] = useState(null); // the digits whose lookup has answered
  const lookingUp = useRef(null); // the digits being looked up (a ref: setting it must not run the lookup again)
  const [call, setCall] = useState(null); // { number, lead, startedAt, endedAt }
  const [now, setNow] = useState(Date.now());
  const [controls, setControls] = useState({ muted: false, held: false, recording: false, keys: false });
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const active = Boolean(call && !call.endedAt);

  useEffect(() => setRecent(readRecent()), []);

  // Messages popping up in the corner move aside while the phone is open (globals.css).
  useEffect(() => {
    document.documentElement.toggleAttribute("data-phone-open", open);
    return () => document.documentElement.removeAttribute("data-phone-open");
  }, [open]);

  // The call's timer.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // The lead a full number belongs to, looked up once per number (Row Level Security decides which).
  const dialed = active ? call.number : value;
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
      if (!tel) return;
      line.call(tel);
      // A phone link pressed is already reported by the activity tracker; one dialed here is reported now.
      if (!fromLink) report(who?.id);
      setControls({ muted: false, held: false, recording: false, keys: false });
      setCall({ number: dialable(number), lead: who ?? null, startedAt: Date.now(), endedAt: null });
      setNow(Date.now());
    },
    [line, report]
  );

  const endCall = useCallback(() => {
    if (!call || call.endedAt) return;
    line.hangUp();
    const endedAt = Date.now();
    setCall((c) => ({ ...c, endedAt }));
    const entry = { number: call.number, leadId: call.lead?.id ?? lead?.id ?? null, co: call.lead?.co ?? lead?.co ?? null, at: call.startedAt, ms: endedAt - call.startedAt };
    setRecent((list) => {
      const next = [entry, ...list].slice(0, 15);
      keepRecent(next);
      return next;
    });
  }, [call, lead, line]);

  /** Open the phone on a number (and its lead); `call`: dial it at once. */
  const openPhone = useCallback(
    ({ number = "", leadId = null, call: dialNow = false, fromLink = false } = {}) => {
      if (active) {
        // One call at a time: show the one going on.
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
      if (!a || a.closest("[data-phone-dock]")) return;
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
        if (t instanceof Element && t.closest("[data-phone-dock]")) setOpen(false);
        return;
      }
      if (t?.hasAttribute?.("data-phone-number")) return; // its own input handles digits and Enter
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

  const context = useMemo(() => ({ openPhone, active }), [openPhone, active]);
  const who = call?.lead?.co ? call.lead : lead;

  return (
    <PhoneContext.Provider value={context}>
      {children}
      <div data-phone-dock className="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 print:hidden">
        {open ? (
          <section aria-label="Phone" data-phone-panel
            className="animate-pop-in pointer-events-auto flex max-h-[calc(100svh-6rem)] w-[20rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-card shadow-[0_24px_70px_-20px_rgb(0_0_0/0.55)]">
            <header className="flex items-center justify-between gap-2 border-b border-[var(--panel-border)] px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Phone</div>
                <div className="truncate text-[0.66rem] text-muted-foreground" title={line.note} data-phone-line={line.id}>{line.label}</div>
              </div>
              <div className="flex items-center gap-1">
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

            {tab === "recent" ? (
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
                    {active ? `In your calling app · ${callClock(now - call.startedAt)}` : call ? `Call ended · ${callClock(call.endedAt - call.startedAt)}` : "Ready"}
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
              </div>
            )}
          </section>
        ) : null}

        {/* The phone button: a call going on shows here with its time. */}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Minimize the phone" : active ? "Show the call" : "Open the phone"} data-phone-button
          className={cn("pointer-events-auto flex h-14 items-center justify-center gap-2 rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95",
            active ? "bg-emerald-500 px-5" : "w-14 bg-primary text-primary-foreground")}>
          <Phone className={cn("size-6", active && "animate-pulse")} />
          {active ? <span className="text-sm font-semibold tabular-nums" data-phone-timer>{callClock(now - call.startedAt)}</span> : null}
        </button>
      </div>
    </PhoneContext.Provider>
  );
}

/** The calls made lately from this browser: who, when, how long; one picked fills the keypad, the button calls. */
function Recent({ list, disabled, onPick, onCall }) {
  if (!list.length) return <p className="px-4 py-10 text-center text-sm text-muted-foreground" data-phone-recent>No calls yet.</p>;
  return (
    <ul className="min-h-0 flex-1 divide-y divide-[var(--panel-border)] overflow-y-auto" data-phone-recent>
      {list.map((r) => (
        <li key={`${r.at}-${r.number}`} className="flex items-center gap-2 px-4 py-2.5" data-phone-recent-row>
          <button type="button" onClick={() => onPick(r)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-medium">{r.co ?? formatDial(r.number)}</div>
            <div className="truncate text-[0.7rem] text-muted-foreground tabular-nums">
              {r.co ? `${formatDial(r.number)} · ` : ""}
              {new Date(r.at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })} · {callClock(r.ms)}
            </div>
          </button>
          <button type="button" onClick={() => onCall(r)} disabled={disabled} aria-label={`Call ${r.co ?? formatDial(r.number)}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-transform hover:scale-105 disabled:opacity-40">
            <Phone className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
