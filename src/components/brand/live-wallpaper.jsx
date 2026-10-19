"use client";

import { useEffect, useRef } from "react";

/**
 * The live wallpapers (Appearance, Sean, Oct 2026): drawn on a canvas behind
 * the workspace, in the theme's colours (soft on light, glowing on dark).
 *
 *   live-constellation  points drifting, linked when near each other
 *   live-waves          layered waves rolling along the foot of the screen
 *   live-glow           soft lights wandering slowly
 *   live-starfield      stars streaming gently towards you
 *
 * Paused while the tab is hidden; one still frame for anyone who turns motion off.
 */
const CYAN = [6, 182, 212];
const BLUE = [79, 139, 198];
const PURPLE = [139, 92, 246];
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;

const SCENES = {
  "live-constellation": () => {
    let pts = [];
    return {
      seed(w, h) {
        const n = Math.round(Math.min(110, (w * h) / 16000));
        pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35 }));
      },
      draw(ctx, w, h, t, dark, moving) {
        ctx.fillStyle = dark ? "#070b16" : "#f3f7fc";
        ctx.fillRect(0, 0, w, h);
        for (const p of pts) {
          if (moving) {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > w) p.vx *= -1;
            if (p.y < 0 || p.y > h) p.vy *= -1;
          }
        }
        const reach = 140;
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.hypot(dx, dy);
            if (d < reach) {
              ctx.strokeStyle = rgba(dark ? CYAN : BLUE, (1 - d / reach) * (dark ? 0.35 : 0.3));
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
            }
          }
        }
        for (const p of pts) {
          ctx.fillStyle = rgba(dark ? CYAN : BLUE, dark ? 0.85 : 0.6);
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill();
        }
      },
    };
  },
  "live-waves": () => ({
    seed() {},
    draw(ctx, w, h, t, dark) {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, dark ? "#070b18" : "#f5f9ff");
      sky.addColorStop(1, dark ? "#0c1630" : "#e3efff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const layers = [[PURPLE, 0.55, 26, 0.0012, 0.6, dark ? 0.22 : 0.16], [BLUE, 0.65, 22, 0.0016, 0.9, dark ? 0.26 : 0.2], [CYAN, 0.76, 18, 0.0021, 1.2, dark ? 0.3 : 0.22]];
      for (const [color, base, amp, freq, speed, alpha] of layers) {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const y = h * base + Math.sin(x * freq + t * 0.0006 * speed) * amp + Math.sin(x * freq * 2.3 + t * 0.0004 * speed) * amp * 0.4;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = rgba(color, alpha);
        ctx.fill();
      }
    },
  }),
  "live-glow": () => {
    let blobs = [];
    return {
      seed(w, h) {
        blobs = [CYAN, PURPLE, BLUE, PURPLE, CYAN].map((c, i) => ({ c, x: Math.random() * w, y: Math.random() * h, r: Math.max(w, h) * (0.25 + i * 0.04), a: Math.random() * Math.PI * 2, s: 0.00012 + Math.random() * 0.00012 }));
      },
      draw(ctx, w, h, t, dark) {
        ctx.fillStyle = dark ? "#080a14" : "#f7f8fd";
        ctx.fillRect(0, 0, w, h);
        for (const b of blobs) {
          const x = b.x + Math.cos(t * b.s + b.a) * w * 0.18;
          const y = b.y + Math.sin(t * b.s * 1.3 + b.a) * h * 0.18;
          const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
          g.addColorStop(0, rgba(b.c, dark ? 0.22 : 0.18));
          g.addColorStop(1, rgba(b.c, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
      },
    };
  },
  "live-starfield": () => {
    let stars = [];
    const make = () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() });
    return {
      seed() { stars = Array.from({ length: 220 }, make); },
      draw(ctx, w, h, t, dark, moving) {
        ctx.fillStyle = dark ? "#04060d" : "#eef3fb";
        ctx.fillRect(0, 0, w, h);
        for (const s of stars) {
          if (moving) {
            s.z -= 0.0016;
            if (s.z <= 0.02) Object.assign(s, make(), { z: 1 });
          }
          const k = 0.5 / s.z;
          const x = w / 2 + s.x * k * w * 0.5;
          const y = h / 2 + s.y * k * h * 0.5;
          if (x < 0 || x > w || y < 0 || y > h) continue;
          const size = (1 - s.z) * 2.4 + 0.3;
          ctx.fillStyle = dark ? `rgba(220, 235, 255, ${0.25 + (1 - s.z) * 0.7})` : rgba(s.x > 0 ? BLUE : PURPLE, 0.15 + (1 - s.z) * 0.5);
          ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
        }
      },
    };
  },
};

export const LIVE_SCENES = Object.keys(SCENES);

export default function LiveWallpaper({ scene }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const make = SCENES[scene];
    if (!canvas || !make) return;
    const ctx = canvas.getContext("2d");
    const s = make();
    let w = 0, h = 0, raf = 0;
    const dark = () => document.documentElement.classList.contains("dark");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      s.seed(w, h);
    };
    const frame = (t) => {
      s.draw(ctx, w, h, t, dark(), true);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (still.matches || document.hidden) s.draw(ctx, w, h, 0, dark(), false);
      else raf = requestAnimationFrame(frame);
    };
    resize();
    start();
    const onResize = () => { resize(); start(); };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", start);
    still.addEventListener?.("change", start);
    // A theme switch redraws a still frame in the new colours.
    const themeWatch = new MutationObserver(() => { if (still.matches) start(); });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", start);
      still.removeEventListener?.("change", start);
      themeWatch.disconnect();
    };
  }, [scene]);

  return <canvas ref={ref} aria-hidden data-live-wallpaper={scene} className="absolute inset-0 h-full w-full" />;
}
