#!/usr/bin/env node
/**
 * Cursor styles (Oct 2026: the client's twenty, chosen in Appearance): each
 * draws at rest, over something to click and pressed, at each size, as an
 * image about the size of a computer's own cursor, its hotspot inside it.
 */
import { CURSOR_SIZES, CURSOR_STYLES, cursorImages, cursorStyle, cursorSvg, isCursorStyle } from "../../src/lib/cursor-styles.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
};

check("twenty styles, the computer's own first", CURSOR_STYLES.length === 20 && CURSOR_STYLES[0][0] === "standard", CURSOR_STYLES.length);
check("the computer's own has no images", cursorImages("standard") === null && cursorStyle("standard") === null && isCursorStyle("standard"));
check("an unknown style is none", cursorImages("nope") === null && !isCursorStyle("nope"));

const problems = [];
for (const [id] of CURSOR_STYLES.slice(1)) {
  for (const [size, , scale] of CURSOR_SIZES) {
    for (const state of ["rest", "hover", "press"]) {
      const c = cursorSvg(id, state, size);
      const w = Number(/width="(\d+)"/.exec(c.svg)?.[1]);
      const h = Number(/height="(\d+)"/.exec(c.svg)?.[1]);
      const opens = (c.svg.match(/<(?!\/)[a-zA-Z]+[^>]*[^/]>/g) ?? []).length;
      const closes = (c.svg.match(/<\/[a-zA-Z]+>/g) ?? []).length;
      if (!c.svg.startsWith("<svg") || opens !== closes) problems.push(`${id} ${state} ${size}: tags ${opens}/${closes}`);
      if (/undefined|NaN/.test(c.svg)) problems.push(`${id} ${state} ${size}: undefined or NaN in it`);
      if (!(c.hot[0] >= 0 && c.hot[1] >= 0 && c.hot[0] < w && c.hot[1] < h)) problems.push(`${id} ${state} ${size}: hotspot ${c.hot} outside ${w}x${h}`);
      // Browsers take cursors up to 128px.
      if (w > 128 || h > 128) problems.push(`${id} ${state} ${size}: ${w}x${h} too big for a cursor`);
      // At rest and Normal: about a computer's own cursor (the image a little larger, for its glow and ring).
      if (state === "rest" && size === "normal" && (h < 30 || h > 52)) problems.push(`${id}: ${h}px tall at Normal`);
      void scale;
    }
  }
}
check("every style draws at rest, over something and pressed, at each size: whole, its hotspot inside, no bigger than a cursor can be", problems.length === 0, problems.slice(0, 5).join("; "));
const tall = (id) => Number(/height="(\d+)"/.exec(cursorSvg(id, "rest", "normal").svg)[1]);
check("about the size of a computer's own cursor at Normal (not the first Gem arrow's 52px)", tall("electric-gem") <= 40 && tall("modern-blue") <= 40, `${tall("electric-gem")} / ${tall("modern-blue")}`);
check("Large Classic is larger", tall("large-classic") > tall("modern-blue"));
const sizes = CURSOR_SIZES.map(([k]) => Number(/height="(\d+)"/.exec(cursorSvg("neon-green", "rest", k).svg)[1]));
check("Small, Normal and Large in that order", sizes[0] < sizes[1] && sizes[1] < sizes[2], sizes.join(" < "));
check("over something to click, larger", Number(/height="(\d+)"/.exec(cursorSvg("neon-green", "hover").svg)[1]) > tall("neon-green"));
check("pressed, a ring round it", /<circle[^>]*stroke-width="1.4"/.test(cursorSvg("neon-green", "press").svg) && !/stroke-width="1.4"/.test(cursorSvg("neon-green", "rest").svg));
check("the Electric Gem has its current, Heart its hearts, Ice its snow", cursorStyle("electric-gem").effect === "electric" && cursorStyle("heart").effect === "hearts" && cursorStyle("ice").effect === "snow");
check("the Magic Wand clicks where its star is", cursorStyle("magic-wand").tip.join() === "5,4");

console.log(failures ? `\n${failures} test(s) failed.\n` : "\nAll cursor style tests passed.\n");
process.exit(failures ? 1 : 0);
