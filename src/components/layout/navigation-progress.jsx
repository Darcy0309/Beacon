"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A thin cyan-to-purple bar along the top of the window while a page is on
 * its way (Sean, Oct 2026), whatever started it: a link (intent-link.jsx
 * reports each one as Next.js has it pending), a table row, a search result,
 * the next lead after a call, a filter or a page of a list. Each reports
 * while it waits; the bar runs while any does, then fills and fades.
 */

const waiting = new Set();
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const anyWaiting = () => waiting.size > 0;

/** Report `pending` (a navigation of this component's on its way) to the bar. */
export function useReportPending(pending) {
  useEffect(() => {
    if (!pending) return;
    const token = {};
    waiting.add(token);
    emit();
    return () => {
      waiting.delete(token);
      emit();
    };
  }, [pending]);
}

/**
 * useRouter, with push and replace reported to the bar until the page they
 * open is showing (each in a transition, so React knows when that is).
 */
export function useNavigationRouter() {
  const router = useRouter();
  const [pending, start] = useTransition();
  useReportPending(pending);
  return useMemo(() => ({
    ...router,
    push: (href, options) => start(() => router.push(href, options)),
    replace: (href, options) => start(() => router.replace(href, options)),
  }), [router]);
}

// Under this, a navigation is done before the bar would show: it is not drawn at all.
const SHOWS_AFTER_MS = 120;

export default function NavigationProgress() {
  const pending = useSyncExternalStore(subscribe, anyWaiting, () => false);
  const [phase, setPhase] = useState("idle"); // idle | loading | done
  const startedAt = useRef(0);

  useEffect(() => {
    if (pending) {
      startedAt.current = Date.now();
      setPhase("loading");
      return;
    }
    // A quick one ends unseen; a slow one fills the bar and fades it.
    setPhase((p) => (p === "loading" ? (Date.now() - startedAt.current > SHOWS_AFTER_MS ? "done" : "idle") : p));
  }, [pending]);
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 600);
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-navigating", pending);
  }, [pending]);

  return (
    <div aria-hidden data-nav-progress={phase} className={cn("nav-progress", phase !== "idle" && `is-${phase}`)}>
      {phase !== "idle" ? <span className="nav-progress-fill" /> : null}
      {phase === "done" ? <span className="nav-progress-finish" /> : null}
    </div>
  );
}
