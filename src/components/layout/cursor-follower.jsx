"use client";

import { useEffect, useRef } from "react";
import { GEM, OUTLINE, TIP, at, cursorImages, pt } from "@/lib/gem-cursor";

// What sets the gem crackling: anything that acts on a click (buttons, links, cards, the menu). globals.css gives these the hover cursor.
const CLICKABLE = 'a[href], button, [role="button"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], summary, select, label:has(> select), '
  + 'input[type="checkbox"], input[type="radio"], input[type="range"], input[type="file"], input[type="color"], input[type="submit"], input[type="button"], .cursor-pointer, [data-tip]';
// Where the computer's usual cursor says more (globals.css keeps it there): typing, dragging, a cell, something switched off.
const OWN_CURSOR = 'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="file"], [type="color"], [type="image"]), '
  + 'textarea, [contenteditable]:not([contenteditable="false"]), .cursor-text, .cursor-cell, .cursor-grab, .cursor-grabbing, :disabled, [aria-disabled="true"]';
const EDGES = 3;
const ARCS = 2;
const TENDRILS = 3;
const SPARKS = 9;

// The cursor itself is the computer's (an image), drawn over everything on the page, this too: so the current is
// drawn where the arrow doesn't cover it, outside its frame. The outline's winding, for which side is outside.
const WIND = Math.sign(OUTLINE.reduce((sum, [x1, y1], i) => {
  const [x2, y2] = OUTLINE[(i + 1) % OUTLINE.length];
  return sum + (x1 * y2 - x2 * y1);
}, 0));
/** A point `off` outside the frame, `t` of the way along its edge `i`. */
function beside(i, t, off) {
  const [x1, y1] = OUTLINE[i];
  const [x2, y2] = OUTLINE[(i + 1) % OUTLINE.length];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (WIND * (y2 - y1)) / len;
  const ny = (WIND * -(x2 - x1)) / len;
  return [x1 + (x2 - x1) * t + nx * off, y1 + (y2 - y1) * t + ny * off];
}

/** Current running along the outside of the frame: a jagged line down one edge and round the corner onto the next. */
function edgeBolt() {
  const i = Math.floor(Math.random() * OUTLINE.length);
  const from = Math.random() * 0.5;
  const steps = 7;
  let d = "";
  for (let k = 0; k <= steps; k++) {
    const t = from + ((1 - from) * k) / steps;
    d += `${k ? "L" : "M"}${pt(beside(i, t, 2.2 + Math.random() * 3))} `;
  }
  const j = (i + 1) % OUTLINE.length;
  for (let k = 1; k <= 3; k++) d += `L${pt(beside(j, k * 0.12, 2.2 + Math.random() * 3))} `;
  return d;
}

/** An arc of current round the whole arrow: from one angle to another about the gem, its radius jumping as it goes. */
function arc() {
  const start = Math.random() * Math.PI * 2;
  const span = (0.35 + Math.random() * 0.4) * Math.PI;
  const steps = 12;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const r = 27 + (Math.random() - 0.5) * 6;
    d += `${i ? "L" : "M"}${pt(at(r, start + (span * i) / steps))} `;
  }
  return d;
}

/** A tendril: the current leaping off the frame, outward, in a crooked line. */
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

/**
 * The gem cursor (Oct 2026: the whole app, to the client's design). The
 * arrow and its emerald are the computer's own cursor, as an image
 * (lib/gem-cursor.js, set on <html> as --gem-cursor-*), so it moves exactly
 * as fast as the system's pointer; a larger, glowing one over what can be
 * clicked, and the gem pushed in on a press. What an image can't do is drawn
 * here, over it: over something to click, electric current crackling round
 * the gem with tendrils and sparks; on a click, rings sent out from it.
 * Only with a mouse (not a touch screen), and only while this runs
 * (html[data-cursor-live]); over a text box, a drag handle or something
 * switched off, the computer's usual cursor. Appearance can turn it off.
 */
export default function CursorFollower() {
  const box = useRef(null);
  const edges = useRef([]);
  const arcs = useRef([]);
  const tendrils = useRef([]);
  const sparks = useRef([]);
  const ripples = useRef([]);

  useEffect(() => {
    const html = document.documentElement;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const images = cursorImages();
    // The most immediate pointer event the browser has (Chrome: as the mouse reports, not once a frame).
    const MOVE = "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove";
    let on = false;
    let crackle = 0;
    let hovering = false;
    let lastTarget = null;

    const set = (key, value) => { if (box.current) box.current.dataset[key] = value ? "true" : "false"; };
    // The current, redrawn many times a second while over something to click: it crackles, and the sparks flicker.
    const spark = () => {
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
    };
    const charge = (yes) => {
      if (yes === hovering) return;
      hovering = yes;
      set("hover", yes);
      clearInterval(crackle);
      crackle = 0;
      if (yes) {
        spark();
        if (!still.matches) crackle = setInterval(spark, 60);
      }
    };
    const move = (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      // The effects sit on the cursor: placed where the pointer is, larger with it over something to click.
      if (box.current) {
        box.current.style.transform = `translate3d(${e.clientX - TIP[0]}px, ${e.clientY - TIP[1]}px, 0)`;
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
    // A click: rings sent out from the gem (the animation started again each time).
    const pressDown = () => {
      if (still.matches) return;
      ripples.current.forEach((r) => {
        if (!r) return;
        r.classList.remove("gem-cursor-ripple-go");
        r.getBoundingClientRect();
        r.classList.add("gem-cursor-ripple-go");
      });
    };
    const leave = () => { set("hidden", true); charge(false); lastTarget = null; };

    const start = () => {
      if (on) return;
      on = true;
      html.style.setProperty("--gem-cursor-rest", images.rest);
      html.style.setProperty("--gem-cursor-hover", images.hover);
      html.style.setProperty("--gem-cursor-press", images.press);
      html.dataset.cursorLive = "";
      window.addEventListener(MOVE, move, { passive: true });
      window.addEventListener("pointerdown", pressDown, { passive: true });
      document.addEventListener("pointerleave", leave);
      window.addEventListener("blur", leave);
    };
    const stop = () => {
      if (!on) return;
      on = false;
      delete html.dataset.cursorLive;
      leave();
      window.removeEventListener(MOVE, move);
      window.removeEventListener("pointerdown", pressDown);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
    };
    // On with a mouse and the gem chosen; changed from Appearance (data-cursor) or a mouse plugged in, it follows.
    const sync = () => (fine.matches && html.dataset.cursor !== "standard" ? start() : stop());
    sync();
    fine.addEventListener("change", sync);
    const watch = new MutationObserver(sync);
    watch.observe(html, { attributes: true, attributeFilter: ["data-cursor"] });
    return () => {
      stop();
      clearInterval(crackle);
      fine.removeEventListener("change", sync);
      watch.disconnect();
    };
  }, []);

  return (
    <div ref={box} aria-hidden className="gem-cursor" data-hidden="true" data-hover="false" style={{ visibility: "hidden" }}>
      <svg width="44" height="50" viewBox="0 0 44 50" overflow="visible">
        <defs>
          <filter id="gem-cursor-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* The rings a click sends out, from just outside the arrow (the cursor covers what is inside it). */}
        {[0, 1].map((i) => (
          <circle key={i} ref={(el) => { ripples.current[i] = el; }} cx={GEM[0]} cy={GEM[1]} r="24" className="gem-cursor-ripple" />
        ))}
        {/* The current, outside the frame (the cursor covers the rest): along its edges, in arcs round it, leaping off it, and sparks. */}
        <g className="gem-cursor-electric" filter="url(#gem-cursor-glow)">
          {Array.from({ length: EDGES }, (_, i) => <path key={`e${i}`} ref={(el) => { edges.current[i] = el; }} className="gem-cursor-bolt" />)}
          {Array.from({ length: ARCS }, (_, i) => <path key={`a${i}`} ref={(el) => { arcs.current[i] = el; }} className="gem-cursor-arc" />)}
          {Array.from({ length: TENDRILS }, (_, i) => <path key={`t${i}`} ref={(el) => { tendrils.current[i] = el; }} className="gem-cursor-tendril" />)}
          {Array.from({ length: SPARKS }, (_, i) => <circle key={`s${i}`} ref={(el) => { sparks.current[i] = el; }} r="0.7" className="gem-cursor-spark" />)}
        </g>
      </svg>
    </div>
  );
}
