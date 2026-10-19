"use client";

import { useEffect, useRef } from "react";
import { BadgeCheck, CalendarCheck, Fingerprint, KeyRound, Lock, Mail, MessageSquare, Phone, ShieldCheck, Smartphone } from "lucide-react";

/**
 * The sign-in page's welcome (Oct 2026): Material-style badges (a white icon
 * on a coloured tile, raised) for what keeps an account safe and what the
 * work is (email, phone, the lock, the shield, a key, a fingerprint, the
 * code on the phone), flying in from every side to rest around the form,
 * then floating gently. Decoration only; still for anyone who turns motion
 * off, and fewer on a phone (globals.css, .login-fly). Bring the pointer near
 * one and it bounces away from it, then springs back to its spot.
 *
 * Each: the icon, its colour, where it rests (left/top, % of the screen),
 * the side it comes from, how big, and when it arrives.
 */
const BADGES = [
  [Mail, "#e53935", 12, 18, "left", 64, 0.1],
  [Phone, "#43a047", 84, 16, "right", 60, 0.25],
  [Lock, "#1e88e5", 8, 62, "left", 56, 0.4],
  [ShieldCheck, "#3949ab", 88, 58, "right", 68, 0.3],
  [KeyRound, "#ffb300", 24, 86, "bottom", 50, 0.55],
  [Fingerprint, "#8e24aa", 74, 84, "bottom", 58, 0.45],
  [Smartphone, "#00897b", 28, 8, "top", 48, 0.6],
  [MessageSquare, "#00acc1", 66, 6, "top", 46, 0.7],
  [CalendarCheck, "#f4511e", 94, 38, "right", 44, 0.85],
  [BadgeCheck, "#5e35b1", 4, 40, "left", 44, 0.95],
];

// How near the pointer has to come to push a badge (px), and how far it pushes one it touches.
const REACH = 170;
const PUSH = 95;

export default function LoginFlyIns() {
  const ref = useRef(null);

  // The badges never catch the pointer (they must not stand in the way of the form): the page's
  // pointer is followed instead, and each badge near it is pushed directly away, harder the nearer.
  useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const badges = [...root.querySelectorAll(".login-fly")];
    let frame = 0;
    let at = null;
    const push = () => {
      frame = 0;
      for (const b of badges) {
        const inner = b.firstElementChild;
        const r = b.getBoundingClientRect();
        const dx = r.left + r.width / 2 - (at?.x ?? -1e4);
        const dy = r.top + r.height / 2 - (at?.y ?? -1e4);
        const d = Math.hypot(dx, dy) || 1;
        if (at && d < REACH) {
          const k = (1 - d / REACH) * PUSH;
          inner.style.transform = `translate(${(dx / d) * k}px, ${(dy / d) * k}px) rotate(${(dx > 0 ? 1 : -1) * k * 0.25}deg)`;
          inner.dataset.pushed = "";
        } else if (inner.dataset.pushed !== undefined) {
          inner.style.transform = "";
          delete inner.dataset.pushed;
        }
      }
    };
    const move = (e) => {
      at = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(push);
    };
    const leave = () => {
      at = null;
      if (!frame) frame = requestAnimationFrame(push);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" data-login-fly-ins>
      {BADGES.map(([Icon, color, left, top, from, size, delay], i) => (
        <span key={i} className="login-fly" data-from={from} data-fly={i}
          style={{ left: `${left}%`, top: `${top}%`, "--size": `${size}px`, "--delay": `${delay}s`, "--bob": `${5 + (i % 4)}s`, "--tilt": `${(i % 2 ? 1 : -1) * (4 + (i % 3) * 3)}deg` }}>
          <span className="login-fly-push" data-fly-push={i}>
            <span className="login-fly-tile" style={{ "--tile": color }}>
              <Icon className="login-fly-icon" strokeWidth={2.2} />
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
