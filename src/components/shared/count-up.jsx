"use client";

import { useLayoutEffect, useRef } from "react";

const NUMBER = /\d[\d,]*(?:\.\d+)?/;
const DURATION = 900;
const easeOut = (k) => 1 - (1 - k) ** 3;

/** "1,234", "12.5%", "$40k", "4.5/5": the first number, and what is around it. */
function parse(text) {
  const m = text.match(NUMBER);
  if (!m) return null;
  return {
    before: text.slice(0, m.index),
    after: text.slice(m.index + m[0].length),
    target: Number(m[0].replace(/,/g, "")),
    decimals: m[0].split(".")[1]?.length ?? 0,
    grouped: m[0].includes(","),
  };
}

function format(n, p) {
  const r = Number(n.toFixed(p.decimals)) || 0; // rounded, and never "-0"
  const digits = p.grouped
    ? r.toLocaleString("en-US", { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
    : r.toFixed(p.decimals);
  return `${p.before}${digits}${p.after}`;
}

/**
 * A figure that counts up from zero when it appears, and from its old value
 * when it changes. Takes the text as the page would print it and keeps its
 * prefix, suffix, decimals and thousands commas; text with no number ("—")
 * is shown as it is.
 *
 * The server sends the final figure. Until the page's script starts it is
 * held hidden (globals.css, [data-count-up]) so it does not show, drop to
 * zero, and count again; if the script is slow it shows anyway.
 */
export default function CountUp({ value }) {
  const text = String(value ?? "");
  const ref = useRef(null);
  const shown = useRef(0); // the number on screen now

  useLayoutEffect(() => {
    const el = ref.current;
    const node = el?.firstChild;
    const p = parse(text);
    // The slow-script fallback has already shown the final figure: keep it.
    const alreadyShown = el && !el.hasAttribute("data-counted") && getComputedStyle(el).visibility === "visible";
    el?.setAttribute("data-counted", "");
    if (!node || node.nodeType !== Node.TEXT_NODE || !p || alreadyShown
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shown.current = p?.target ?? 0;
      return;
    }

    // Write straight into React's own text node: no re-render per frame,
    // and React still owns the node for the next value.
    const start = shown.current;
    const began = performance.now();
    let frame;
    const step = (now) => {
      // A frame's timestamp can be a little before `began`: never below 0.
      const k = Math.min(1, Math.max(0, (now - began) / DURATION));
      shown.current = start + (p.target - start) * easeOut(k);
      node.nodeValue = k < 1 ? format(shown.current, p) : text;
      if (k < 1) frame = requestAnimationFrame(step);
    };
    node.nodeValue = format(start, p);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return (
    <span ref={ref} data-count-up="" className="tabular-nums">
      {text}
    </span>
  );
}
