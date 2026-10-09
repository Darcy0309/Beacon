"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signOutIdle } from "@/features/auth/actions";
import { IDLE_MINUTES, IDLE_WARNING_MINUTES } from "@/lib/idle";

// Shared by every tab: activity in any of them keeps all of them signed in,
// and signing out in one takes the others to the sign-in page.
const ACTIVITY_KEY = "lighthouse-last-activity";
const SIGNED_OUT_KEY = "lighthouse-idle-signed-out";
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"];
const PING_EVERY_MS = 60_000;

const readShared = () => {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeShared = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
};
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * Signs a manager, agent or client out after 30 minutes without activity
 * (lib/idle.js): a pointer, a key, a scroll in any tab counts. Two minutes
 * before, it asks "Still there?" with a countdown; Stay signed in (or any
 * activity) carries on. While they are active it tells the server, at most
 * once a minute, so a session left behind ends there too.
 */
export default function IdleGuard() {
  const path = usePathname();
  const last = useRef(Date.now());
  const pinged = useRef(0);
  const done = useRef(false);
  const [left, setLeft] = useState(null);
  const [, startLeaving] = useTransition();

  const leave = useCallback(() => {
    if (done.current) return;
    done.current = true;
    writeShared(SIGNED_OUT_KEY, Date.now());
    startLeaving(() => signOutIdle(path));
  }, [path]);

  const ping = useCallback(async () => {
    pinged.current = Date.now();
    try {
      const res = await fetch("/api/session/alive", { method: "POST", cache: "no-store" });
      // The server already ended it (the backstop): go to the sign-in page.
      if (res.redirected || res.status === 401) {
        done.current = true;
        window.location.assign("/login?error=idle");
      }
    } catch {}
  }, []);

  const active = useCallback(() => {
    const now = Date.now();
    if (now - last.current < 1000) return;
    last.current = now;
    writeShared(ACTIVITY_KEY, now);
    if (now - pinged.current > PING_EVERY_MS) ping();
  }, [ping]);

  useEffect(() => {
    writeShared(ACTIVITY_KEY, Date.now());
    ping();
    EVENTS.forEach((e) => window.addEventListener(e, active, { passive: true, capture: true }));
    const onStorage = (e) => {
      if (e.key === SIGNED_OUT_KEY && !done.current) {
        done.current = true;
        window.location.assign("/login?error=idle");
      }
    };
    window.addEventListener("storage", onStorage);
    const tick = () => {
      // The tabs' shared time (every tab writes it), or this tab's own where storage is blocked.
      const idle = Date.now() - (readShared() || last.current);
      const remaining = Math.ceil((IDLE_MINUTES * 60_000 - idle) / 1000);
      if (remaining <= 0) leave();
      else setLeft(remaining <= IDLE_WARNING_MINUTES * 60 ? remaining : null);
    };
    const timer = setInterval(tick, 1000);
    // Back to a tab, or a laptop opened again: check at once.
    document.addEventListener("visibilitychange", tick);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, active, { capture: true }));
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", tick);
      clearInterval(timer);
    };
  }, [active, leave, ping]);

  const stay = () => {
    last.current = 0;
    active();
    setLeft(null);
  };

  return (
    <Dialog open={left != null} onOpenChange={(open) => { if (!open) stay(); }}>
      <DialogContent className="max-w-sm" data-idle-warning>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Still there?</DialogTitle>
          <DialogDescription>
            To keep your account safe, you&apos;ll be signed out after {IDLE_MINUTES} minutes without activity.
          </DialogDescription>
        </DialogHeader>
        <p className="text-center text-3xl font-bold tabular-nums" aria-live="polite" data-idle-countdown>{left != null ? clock(left) : ""}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={leave}><LogOut /> Sign out now</Button>
          <Button type="button" onClick={stay} autoFocus data-idle-stay>Stay signed in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
