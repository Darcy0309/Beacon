"use client";

import { useEffect, useRef } from "react";

// What sets the gem crackling: anything that acts on a click (buttons, links, cards, the menu; as globals.css gives the hand).
const CLICKABLE = 'a[href], button, [role="button"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], summary, select, label:has(> select), '
  + 'input[type="checkbox"], input[type="radio"], input[type="range"], input[type="file"], input[type="color"], input[type="submit"], input[type="button"], .cursor-pointer, [data-tip]';
// Where the computer's own cursor says more (globals.css keeps it there): typing, dragging, a cell, something switched off.
const OWN_CURSOR = 'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="file"], [type="color"], [type="image"]), '
  + 'textarea, [contenteditable]:not([contenteditable="false"]), .cursor-text, .cursor-cell, .cursor-grab, .cursor-grabbing, :disabled, [aria-disabled="true"]';

// The client's design (Oct 2026): a gold-framed arrowhead of teal crystal, its tip at TIP, two feet below
// and a wing to the right, and a large round emerald in a gold bezel set in its middle.
const TIP = [3, 2];
const POINTS = { wing: [38, 31], notchR: [26, 31], tail: [32, 47], notch: [21, 36], foot: [12, 45] };
const ARROW = `M${TIP} L${POINTS.wing} L${POINTS.notchR} L${POINTS.tail} L${POINTS.notch} L${POINTS.foot} Z`;
const GEM = [16.5, 24.5];
const BEZEL = 8.2;
const STONE = 6.9;
const at = (r, a) => [GEM[0] + r * Math.cos(a), GEM[1] + r * Math.sin(a)];
const pt = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
// The crystal's facets: from the tip and the gem's edge out to the arrow's corners.
const CRYSTAL = [
  `M${TIP} L${pt(at(BEZEL, -2.2))}`, `M${POINTS.wing} L${pt(at(BEZEL, -0.25))}`, `M${POINTS.foot} L${pt(at(BEZEL, 1.95))}`,
  `M${POINTS.tail} L${pt(at(BEZEL, 0.95))}`, `M${POINTS.notchR} L${pt(at(BEZEL, 0.35))}`, `M${POINTS.notch} L${pt(at(BEZEL, 1.35))}`,
].join(" ");
// The emerald, a round brilliant seen from above: an octagonal table, a star round it, and the girdle's facets.
const TABLE = Array.from({ length: 8 }, (_, i) => at(3.1, (Math.PI / 4) * i + Math.PI / 8));
const STAR = Array.from({ length: 8 }, (_, i) => at(5.1, (Math.PI / 4) * i));
const GIRDLE = Array.from({ length: 16 }, (_, i) => at(STONE, (Math.PI / 8) * i));
const FACETS = [
  ...TABLE.map((p, i) => `M${pt(p)} L${pt(STAR[i])} L${pt(TABLE[(i + 7) % 8])}`),
  ...STAR.map((p, i) => `M${pt(p)} L${pt(GIRDLE[(2 * i + 15) % 16])} M${pt(p)} L${pt(GIRDLE[(2 * i + 1) % 16])}`),
].join(" ");
const ARCS = 3;
const SPARKS = 7;

/** A bolt round the gem: a jagged line from one angle to another, its radius jumping as it goes; now and then a fork. */
function arc() {
  const start = Math.random() * Math.PI * 2;
  const span = (0.5 + Math.random() * 0.5) * Math.PI;
  const steps = 10;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const r = 10 + (i === 0 || i === steps ? 0 : (Math.random() - 0.5) * 5);
    d += `${i ? "L" : "M"}${pt(at(r, start + (span * i) / steps))} `;
  }
  if (Math.random() < 0.5) {
    const a = start + span * (0.3 + Math.random() * 0.4);
    d += `M${pt(at(10, a))} L${pt(at(13 + Math.random() * 3, a + 0.2))} L${pt(at(15 + Math.random() * 3, a + 0.05))}`;
  }
  return d;
}

/** A tendril: the current leaping off the gem, out past the frame, in a crooked line. */
function tendril() {
  const a = Math.random() * Math.PI * 2;
  let [x, y] = at(BEZEL, a);
  let d = `M${pt([x, y])}`;
  for (let i = 0; i < 6; i++) {
    const step = 2.4 + Math.random() * 1.6;
    const turn = a + (Math.random() - 0.5) * 1.6;
    x += step * Math.cos(turn);
    y += step * Math.sin(turn);
    d += ` L${pt([x, y])}`;
  }
  return d;
}

/**
 * The gem cursor (Oct 2026: the whole app, to the client's design): a
 * gold-framed arrowhead of teal crystal with a large emerald set in it like
 * a button. Over anything that can be clicked (a button, a link, a card, the
 * menu) electric current crackles round the gem and leaps off it, with
 * sparks; a click presses the gem in and sends rings out from it. Only with
 * a mouse (not a touch screen), and only while this runs:
 * html[data-cursor-live] is what hides the computer's own pointer
 * (globals.css), so if it never starts, nothing is hidden. Over a text box,
 * a drag handle or something switched off, the computer's own cursor shows
 * instead. Appearance can turn it off ("standard").
 */
export default function CursorFollower() {
  const box = useRef(null);
  const arcs = useRef([]);
  const tendrils = useRef([]);
  const sparks = useRef([]);
  const ripples = useRef([]);

  useEffect(() => {
    const html = document.documentElement;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let on = false;
    let crackle = 0;
    let hovering = false;

    const set = (key, value) => { if (box.current) box.current.dataset[key] = value ? "true" : "false"; };
    // The current, redrawn many times a second while over something to click: it crackles, and the sparks flicker.
    const spark = () => {
      arcs.current.forEach((p) => p?.setAttribute("d", arc()));
      tendrils.current.forEach((p) => p?.setAttribute("d", Math.random() < 0.6 ? tendril() : ""));
      sparks.current.forEach((c) => {
        if (!c) return;
        const [x, y] = at(9 + Math.random() * 9, Math.random() * Math.PI * 2);
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
      if (box.current) box.current.style.transform = `translate3d(${e.clientX - TIP[0]}px, ${e.clientY - TIP[1]}px, 0)`;
      const target = e.target instanceof Element ? e.target : null;
      const own = Boolean(target?.closest(OWN_CURSOR));
      set("hidden", own);
      charge(!own && Boolean(target?.closest(CLICKABLE)));
    };
    // A click: the gem pressed in, and rings sent out from it (the animation started again each time).
    const pressDown = () => {
      set("press", true);
      if (still.matches) return;
      ripples.current.forEach((r) => {
        if (!r) return;
        r.classList.remove("gem-cursor-ripple-go");
        r.getBoundingClientRect();
        r.classList.add("gem-cursor-ripple-go");
      });
    };
    const pressUp = () => set("press", false);
    const leave = () => { set("hidden", true); charge(false); };

    const start = () => {
      if (on) return;
      on = true;
      html.dataset.cursorLive = "";
      window.addEventListener("pointermove", move, { passive: true });
      window.addEventListener("pointerdown", pressDown, { passive: true });
      window.addEventListener("pointerup", pressUp, { passive: true });
      document.addEventListener("pointerleave", leave);
      window.addEventListener("blur", leave);
    };
    const stop = () => {
      if (!on) return;
      on = false;
      delete html.dataset.cursorLive;
      leave();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", pressDown);
      window.removeEventListener("pointerup", pressUp);
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
    <div ref={box} aria-hidden className="gem-cursor" data-hidden="true" data-hover="false" data-press="false">
      <svg width="44" height="50" viewBox="0 0 44 50" overflow="visible">
        <defs>
          <linearGradient id="gem-cursor-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbf0c8" />
            <stop offset="45%" stopColor="#d9b56a" />
            <stop offset="100%" stopColor="#8f6a2e" />
          </linearGradient>
          <linearGradient id="gem-cursor-crystal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2fae98" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#0f5a52" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#073531" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id="gem-cursor-emerald" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#b6ffe9" />
            <stop offset="35%" stopColor="#2fe0b0" />
            <stop offset="75%" stopColor="#0f9c78" />
            <stop offset="100%" stopColor="#065343" />
          </radialGradient>
          <filter id="gem-cursor-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* The rings a click sends out from the gem. */}
        {[0, 1].map((i) => (
          <circle key={i} ref={(el) => { ripples.current[i] = el; }} cx={GEM[0]} cy={GEM[1]} r={BEZEL} className="gem-cursor-ripple" />
        ))}
        {/* The arrowhead: teal crystal in a gold frame, its facets catching the light. */}
        <path d={ARROW} fill="url(#gem-cursor-crystal)" />
        <path d={CRYSTAL} className="gem-cursor-crystal-facets" />
        <path d={ARROW} className="gem-cursor-frame" />
        {/* The emerald in its gold bezel, set in like a button. */}
        <g className="gem-cursor-gem">
          <circle cx={GEM[0]} cy={GEM[1]} r={BEZEL} className="gem-cursor-bezel" />
          <circle cx={GEM[0]} cy={GEM[1]} r={STONE} fill="url(#gem-cursor-emerald)" />
          <path d={FACETS} className="gem-cursor-facets" />
          <ellipse cx={GEM[0] - 2.4} cy={GEM[1] - 2.8} rx="1.9" ry="1" transform={`rotate(-35 ${GEM[0] - 2.4} ${GEM[1] - 2.8})`} fill="white" opacity="0.85" />
        </g>
        {/* The current: bolts round the gem, tendrils leaping off it, and sparks, all glowing. */}
        <g className="gem-cursor-electric" filter="url(#gem-cursor-glow)">
          {Array.from({ length: ARCS }, (_, i) => <path key={`a${i}`} ref={(el) => { arcs.current[i] = el; }} className="gem-cursor-bolt" />)}
          {[0, 1].map((i) => <path key={`t${i}`} ref={(el) => { tendrils.current[i] = el; }} className="gem-cursor-tendril" />)}
          {Array.from({ length: SPARKS }, (_, i) => <circle key={`s${i}`} ref={(el) => { sparks.current[i] = el; }} r="0.55" className="gem-cursor-spark" />)}
        </g>
      </svg>
    </div>
  );
}
