"use client";

import { useEffect, useRef, useState } from "react";
import { HOVER_SCALE, OUTLINE, at, cursorImages, cursorScale, cursorStyle, pt } from "@/lib/cursor-styles";

// What sets the effects going: anything that acts on a click (buttons, links, cards, the menu). globals.css gives these the hover cursor.
const CLICKABLE = 'a[href], button, [role="button"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], summary, select, label:has(> select), '
  + 'input[type="checkbox"], input[type="radio"], input[type="range"], input[type="file"], input[type="color"], input[type="submit"], input[type="button"], .cursor-pointer, [data-tip]';
// Where the computer's usual cursor says more (globals.css keeps it there): typing, dragging, a cell, something switched off.
const OWN_CURSOR = 'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="file"], [type="color"], [type="image"]), '
  + 'textarea, [contenteditable]:not([contenteditable="false"]), .cursor-text, .cursor-cell, .cursor-grab, .cursor-grabbing, :disabled, [aria-disabled="true"]';
const EDGES = 3;
const ARCS = 2;
const TENDRILS = 3;
const SPARKS = 9;
const BITS = 8;

// --- The Electric Gem's current. The cursor itself is the computer's (an image), drawn over everything on the page,
// this too: so the current is drawn where the arrow doesn't cover it, outside its frame.
const WIND = Math.sign(OUTLINE.reduce((sum, [x1, y1], i) => {
  const [x2, y2] = OUTLINE[(i + 1) % OUTLINE.length];
  return sum + (x1 * y2 - x2 * y1);
}, 0));
function beside(i, t, off) {
  const [x1, y1] = OUTLINE[i];
  const [x2, y2] = OUTLINE[(i + 1) % OUTLINE.length];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  return [x1 + (x2 - x1) * t + (WIND * (y2 - y1) * off) / len, y1 + (y2 - y1) * t - (WIND * (x2 - x1) * off) / len];
}
function edgeBolt() {
  const i = Math.floor(Math.random() * OUTLINE.length);
  const from = Math.random() * 0.5;
  let d = "";
  for (let k = 0; k <= 7; k++) d += `${k ? "L" : "M"}${pt(beside(i, from + ((1 - from) * k) / 7, 2.2 + Math.random() * 3))} `;
  const j = (i + 1) % OUTLINE.length;
  for (let k = 1; k <= 3; k++) d += `L${pt(beside(j, k * 0.12, 2.2 + Math.random() * 3))} `;
  return d;
}
function arc() {
  const start = Math.random() * Math.PI * 2;
  const span = (0.35 + Math.random() * 0.4) * Math.PI;
  let d = "";
  for (let i = 0; i <= 12; i++) d += `${i ? "L" : "M"}${pt(at(27 + (Math.random() - 0.5) * 6, start + (span * i) / 12))} `;
  return d;
}
function tendril() {
  const i = Math.floor(Math.random() * OUTLINE.length);
  let [x, y] = beside(i, 0.2 + Math.random() * 0.6, 1.5);
  const [ox, oy] = beside(i, 0.5, 10);
  const [cx, cy] = beside(i, 0.5, 0);
  const a = Math.atan2(oy - cy, ox - cx);
  let d = `M${pt([x, y])}`;
  for (let k = 0; k < 5; k++) {
    const turn = a + (Math.random() - 0.5) * 1.4;
    const step = 2.2 + Math.random() * 2;
    x += step * Math.cos(turn);
    y += step * Math.sin(turn);
    d += ` L${pt([x, y])}`;
  }
  return d;
}

// --- The other styles' bits over something to click: hearts, stars, embers, snow, sparkles, round the outside of it.
const STAR5 = Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (Math.PI / 5) * i;
  const r = i % 2 ? 0.8 : 1.9;
  return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
}).join(" ");
const BIT = {
  hearts: { d: "M0 1.6 C -2.8 -0.2, -1.2 -2.3, 0 -0.6 C 1.2 -2.3, 2.8 -0.2, 0 1.6 Z", color: "#f9a8d4" },
  stars: { points: STAR5, color: "#fde68a" },
  embers: { r: 0.8, color: "#fdba74" },
  snow: { d: "M0 -2 L0 2 M-1.7 -1 L1.7 1 M-1.7 1 L1.7 -1", stroke: true, color: "#e0f2fe" },
  sparkles: { d: "M0 -2 L0.45 -0.45 L2 0 L0.45 0.45 L0 2 L-0.45 0.45 L-2 0 L-0.45 -0.45 Z", color: null },
};

/**
 * The cursor styles (Oct 2026: chosen in Appearance from the client's
 * twenty; the computer's own cursor unless someone picks one). A style's
 * arrow is the computer's own cursor, as an image (lib/cursor-styles.js, set
 * on <html> as --cursor-*), so it moves exactly as fast as the system's
 * pointer: larger and glowing over what can be clicked, a ring round it while
 * pressed. What an image can't do is drawn here, over it: over something to
 * click, the Electric Gem's current or a style's hearts, stars, embers, snow
 * or sparkles; on a click, rings sent out. Only with a mouse (not a touch
 * screen), and only while a style is chosen (html[data-cursor-live]); over a
 * text box, a drag handle or something switched off, the usual cursor.
 */
export default function CursorFollower() {
  const box = useRef(null);
  const edges = useRef([]);
  const arcs = useRef([]);
  const tendrils = useRef([]);
  const sparks = useRef([]);
  const bits = useRef([]);
  const ripples = useRef([]);
  // The style chosen, as drawn here: its effect, colour, where its rings go, and its size in pixels.
  const [style, setStyle] = useState(null);
  const styleRef = useRef(null);
  styleRef.current = style;

  useEffect(() => {
    const html = document.documentElement;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    // The most immediate pointer event the browser has (Chrome: as the mouse reports, not once a frame).
    const MOVE = "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove";
    let on = false;
    let crackle = 0;
    let hovering = false;
    let lastTarget = null;
    let hot = [0, 0];
    let current = null;
    const flow = [];

    const set = (key, value) => { if (box.current) box.current.dataset[key] = value ? "true" : "false"; };
    // Over something to click, many times a second: the current crackles; the bits drift up and fade, and come again.
    const tick = () => {
      const s = current;
      if (!s) return;
      if (s.effect === "electric") {
        edges.current.forEach((p) => p?.setAttribute("d", edgeBolt()));
        arcs.current.forEach((p) => p?.setAttribute("d", Math.random() < 0.7 ? arc() : ""));
        tendrils.current.forEach((p) => p?.setAttribute("d", Math.random() < 0.65 ? tendril() : ""));
        sparks.current.forEach((c) => {
          if (!c) return;
          const [x, y] = at(22 + Math.random() * 12, Math.random() * Math.PI * 2);
          c.setAttribute("cx", x.toFixed(2));
          c.setAttribute("cy", y.toFixed(2));
          c.setAttribute("opacity", (Math.random() * 0.9 + 0.1).toFixed(2));
        });
        return;
      }
      bits.current.forEach((el, i) => {
        if (!el) return;
        const b = (flow[i] ??= { life: 0 });
        if (b.life <= 0) {
          // Born round the outside of the cursor, at its ring's edge or a little beyond.
          [b.x, b.y] = at(s.ring * (0.95 + Math.random() * 0.5), Math.random() * Math.PI * 2, s.center);
          b.life = 4 + Math.floor(Math.random() * 5);
          b.size = 0.7 + Math.random() * 0.7;
        }
        b.y -= 1.1;
        b.x += (Math.random() - 0.5) * 0.8;
        b.life -= 1;
        el.style.transform = `translate(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px) scale(${b.size.toFixed(2)})`;
        el.style.opacity = String(Math.min(1, b.life / 3));
      });
    };
    const charge = (yes) => {
      if (yes === hovering) return;
      hovering = yes;
      set("hover", yes);
      clearInterval(crackle);
      crackle = 0;
      if (yes && current?.effect) {
        tick();
        if (!still.matches) crackle = setInterval(tick, current.effect === "electric" ? 60 : 110);
      }
    };
    const move = (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      if (box.current) {
        box.current.style.transform = `translate3d(${e.clientX - hot[0]}px, ${e.clientY - hot[1]}px, 0)`;
        box.current.style.visibility = "visible";
      }
      // What is under the pointer, looked at again only when it changes.
      const target = e.target instanceof Element ? e.target : null;
      if (target === lastTarget) return;
      lastTarget = target;
      const own = Boolean(target?.closest(OWN_CURSOR));
      set("hidden", own);
      charge(!own && Boolean(target?.closest(CLICKABLE)));
    };
    // A click: rings sent out from round the cursor (the animation started again each time).
    const pressDown = () => {
      if (still.matches) return;
      ripples.current.forEach((r) => {
        if (!r) return;
        r.classList.remove("cursor-ripple-go");
        r.getBoundingClientRect();
        r.classList.add("cursor-ripple-go");
      });
    };
    const leave = () => { set("hidden", true); charge(false); lastTarget = null; };

    const start = (id, size) => {
      const images = cursorImages(id, size);
      const s = cursorStyle(id);
      const scale = cursorScale(id, size);
      hot = [Math.round((s.tip[0] - s.box[0]) * scale), Math.round((s.tip[1] - s.box[1]) * scale)];
      charge(false);
      current = { ...s, size, width: Math.ceil(s.box[2] * scale), height: Math.ceil(s.box[3] * scale), hot };
      setStyle(current);
      html.style.setProperty("--cursor-rest", images.rest);
      html.style.setProperty("--cursor-hover", images.hover);
      html.style.setProperty("--cursor-press", images.press);
      html.dataset.cursorLive = "";
      lastTarget = null;
      if (on) return;
      on = true;
      window.addEventListener(MOVE, move, { passive: true });
      window.addEventListener("pointerdown", pressDown, { passive: true });
      document.addEventListener("pointerleave", leave);
      window.addEventListener("blur", leave);
    };
    const stop = () => {
      delete html.dataset.cursorLive;
      current = null;
      setStyle(null);
      if (!on) return;
      on = false;
      leave();
      window.removeEventListener(MOVE, move);
      window.removeEventListener("pointerdown", pressDown);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
    };
    // A style chosen and a mouse: on; changed in Appearance (data-cursor, data-cursor-size) or a mouse plugged in, it follows.
    const sync = () => {
      const id = html.dataset.cursor;
      if (fine.matches && id && cursorStyle(id)) start(id, html.dataset.cursorSize ?? "normal");
      else stop();
    };
    sync();
    fine.addEventListener("change", sync);
    const watch = new MutationObserver(sync);
    watch.observe(html, { attributes: true, attributeFilter: ["data-cursor", "data-cursor-size"] });
    return () => {
      stop();
      clearInterval(crackle);
      fine.removeEventListener("change", sync);
      watch.disconnect();
    };
  }, []);

  if (!style) return null;
  const [bx, by, bw, bh] = style.box;
  const bit = BIT[style.effect];
  return (
    <div ref={box} aria-hidden className="cursor-effects" data-hidden="true" data-hover="false" data-style={style.id}
      style={{ visibility: "hidden", "--cursor-glow": style.glow, "--cursor-hot": `${style.hot[0]}px ${style.hot[1]}px`, "--cursor-hover-scale": HOVER_SCALE }}>
      <svg width={style.width} height={style.height} viewBox={`${bx} ${by} ${bw} ${bh}`} overflow="visible">
        <defs>
          <filter id="cursor-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* The rings a click sends out, from just outside the cursor (it covers what is inside). */}
        {[0, 1].map((i) => (
          <circle key={i} ref={(el) => { ripples.current[i] = el; }} cx={style.center[0]} cy={style.center[1]} r={style.ring + 2}
            className="cursor-ripple" style={{ transformOrigin: `${style.center[0]}px ${style.center[1]}px` }} />
        ))}
        {style.effect === "electric" ? (
          <g className="cursor-electric" filter="url(#cursor-glow)">
            {Array.from({ length: EDGES }, (_, i) => <path key={`e${i}`} ref={(el) => { edges.current[i] = el; }} className="cursor-bolt" />)}
            {Array.from({ length: ARCS }, (_, i) => <path key={`a${i}`} ref={(el) => { arcs.current[i] = el; }} className="cursor-arc" />)}
            {Array.from({ length: TENDRILS }, (_, i) => <path key={`t${i}`} ref={(el) => { tendrils.current[i] = el; }} className="cursor-tendril" />)}
            {Array.from({ length: SPARKS }, (_, i) => <circle key={`s${i}`} ref={(el) => { sparks.current[i] = el; }} r="0.7" className="cursor-spark" />)}
          </g>
        ) : bit ? (
          <g className="cursor-electric" filter="url(#cursor-glow)" data-effect={style.effect}>
            {Array.from({ length: BITS }, (_, i) => {
              const ref = (el) => { bits.current[i] = el; };
              const color = bit.color ?? style.glow;
              return bit.points ? <polygon key={i} ref={ref} points={bit.points} fill={color} className="cursor-bit" />
                : bit.r ? <circle key={i} ref={ref} r={bit.r} fill={color} className="cursor-bit" />
                : <path key={i} ref={ref} d={bit.d} fill={bit.stroke ? "none" : color} stroke={bit.stroke ? color : "none"} strokeWidth={bit.stroke ? 0.5 : 0} className="cursor-bit" />;
            })}
          </g>
        ) : null}
      </svg>
    </div>
  );
}
