"use client";

import { useRef } from "react";
import { BadgeCheck, CalendarCheck, Fingerprint, KeyRound, Lock, Mail, MessageSquare, Phone, ShieldCheck, Smartphone } from "lucide-react";

/**
 * The sign-in page's dock (Sean, Oct 2026): Material-style badges (a white
 * icon on a coloured tile) for what keeps an account safe and what the work
 * is, in a row along the foot of the page like a Mac's Dock. Decoration:
 * the one under the pointer grows, its neighbours a little, each says what
 * it stands for, and nothing is clicked. It rises into place once; still for
 * anyone who turns motion off (globals.css, .login-dock).
 */
const BADGES = [
  [Mail, "#e53935", "Email"],
  [Phone, "#43a047", "Phone"],
  [MessageSquare, "#00acc1", "Messages"],
  [CalendarCheck, "#f4511e", "Appointments"],
  [Lock, "#1e88e5", "Secure sign-in"],
  [ShieldCheck, "#3949ab", "Protected data"],
  [Smartphone, "#00897b", "Two-factor"],
  [KeyRound, "#ffb300", "Passwords"],
  [Fingerprint, "#8e24aa", "Your identity"],
  [BadgeCheck, "#5e35b1", "Verified"],
];

// How far the magnification reaches either side of the pointer (px), and how big the nearest grows.
const REACH = 140;
const GROW = 0.7;

export default function LoginDock() {
  const ref = useRef(null);

  // The Mac's magnify: each badge grows with how near its middle is to the pointer.
  const magnify = (e) => {
    for (const b of ref.current?.querySelectorAll("[data-dock-item]") ?? []) {
      const r = b.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      b.style.setProperty("--grow", String(d < REACH ? 1 + GROW * Math.cos((d / REACH) * (Math.PI / 2)) ** 2 : 1));
    }
  };
  const rest = () => {
    for (const b of ref.current?.querySelectorAll("[data-dock-item]") ?? []) b.style.setProperty("--grow", "1");
  };

  return (
    <div className="login-dock-wrap" data-login-dock>
      <ul ref={ref} className="login-dock" onPointerMove={magnify} onPointerLeave={rest} aria-label="What Lighthouse looks after">
        {BADGES.map(([Icon, color, label], i) => (
          <li key={label} data-dock-item={i} className="login-dock-item" style={{ "--tile": color, "--i": i }}>
            <span className="login-dock-tip" role="presentation">{label}</span>
            <span className="login-dock-tile" aria-label={label} role="img">
              <Icon className="login-dock-icon" strokeWidth={2.2} aria-hidden />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
