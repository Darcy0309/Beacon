"use client";

import { useEffect } from "react";

// Long enough for the cards to settle back to their own widths (the transition in globals.css, and its wait).
const SETTLE_MS = 700;

/**
 * Holds the height of an .expand-row while one of its cards is pointed at
 * (or holds the focus) and takes room from its neighbours. A neighbour made
 * narrower may wrap a line it did not before; with the row's height held
 * that never pushes the page under the row down and back. Released once the
 * pointer has left and the cards have settled, and whenever the window is
 * resized. Once for the whole workspace: it listens on the document.
 */
export default function ExpandRowGuard() {
  useEffect(() => {
    const held = new Map(); // row -> the timer that will release it, or null while it is in use
    const rowOf = (target) => (target instanceof Element ? target.closest(".expand-row") : null);
    const release = (row) => {
      clearTimeout(held.get(row));
      row.style.height = "";
      held.delete(row);
    };
    const enter = (e) => {
      const row = rowOf(e.target);
      if (!row) return;
      if (held.has(row)) {
        clearTimeout(held.get(row));
        held.set(row, null);
        return;
      }
      // Only where the cards are one row (a flex row, from a desktop's width up).
      if (getComputedStyle(row).display !== "flex") return;
      row.style.height = `${row.getBoundingClientRect().height}px`;
      held.set(row, null);
    };
    const leave = (e) => {
      const row = rowOf(e.target);
      if (!row || !held.has(row)) return;
      if (e.relatedTarget instanceof Node && row.contains(e.relatedTarget)) return;
      clearTimeout(held.get(row));
      held.set(row, setTimeout(() => release(row), SETTLE_MS));
    };
    const releaseAll = () => [...held.keys()].forEach(release);

    document.addEventListener("mouseover", enter);
    document.addEventListener("mouseout", leave);
    document.addEventListener("focusin", enter);
    document.addEventListener("focusout", leave);
    window.addEventListener("resize", releaseAll);
    return () => {
      document.removeEventListener("mouseover", enter);
      document.removeEventListener("mouseout", leave);
      document.removeEventListener("focusin", enter);
      document.removeEventListener("focusout", leave);
      window.removeEventListener("resize", releaseAll);
      releaseAll();
    };
  }, []);
  return null;
}
