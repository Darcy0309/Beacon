"use client";

import { SphereGlyph, useLogoId } from "@/components/brand/logo-mark";
import { GEM, WORD, WORD_LEFT } from "@/components/brand/logo-paths";
import { cn } from "@/lib/utils";

// Font units to logo units. As in the artwork, the sphere is about 2.4 times
// the height of a capital: cap height 1457 x 0.0149 ≈ 21.7 beside a 52-wide sphere.
const SCALE = 0.0149;
const WORD_X = 69 - WORD_LEFT * SCALE;
const BASELINE = 43;

/** The sapphire that dots the "i", drawn in the word's font units. */
function Sapphire({ id }) {
  const { cx, cy, r } = GEM;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id}-gem)`} stroke="#dfe4f2" strokeWidth="22" />
      <path
        d={`M ${cx} ${cy - r * 0.8} L ${cx + r * 0.62} ${cy} L ${cx} ${cy + r * 0.8} L ${cx - r * 0.62} ${cy} Z`}
        fill="none"
        stroke="#c8d2ff"
        strokeOpacity="0.45"
        strokeWidth="12"
      />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.19} fill="#ffffff" fillOpacity="0.85" />
    </>
  );
}

/**
 * The full logo: the Signature sphere and "Lighthouse", silver turning to
 * navy through the "t", with a sapphire for the dot of the "i".
 *
 * Its colours are the --logo-* variables in globals.css, so the word stays
 * readable on both themes. tone="dark" forces the dark-surface colours, for
 * pages that are dark whatever the theme (sign-in, setup).
 */
export default function LighthouseWordmark({ className, tone }) {
  const id = useLogoId();
  return (
    <svg viewBox="0 0 220 64" className={cn(tone === "dark" && "logo-on-dark", className)} role="img" aria-label="Lighthouse">
      <SphereGlyph id={`${id}-mark`} />
      <defs>
        {/* Silver until the "t", navy from there (font units). */}
        <linearGradient id={`${id}-metal`} gradientUnits="userSpaceOnUse" x1="3950" y1="0" x2="4750" y2="0">
          <stop offset="0" style={{ stopColor: "var(--logo-silver, #d9dade)" }} />
          <stop offset="1" style={{ stopColor: "var(--logo-navy, #2e2b6b)" }} />
        </linearGradient>
        {/* Light from above, shade below: the metallic bevel. */}
        <linearGradient id={`${id}-sheen`} gradientUnits="userSpaceOnUse" x1="0" y1="-1500" x2="0" y2="360">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="0.6" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id={`${id}-gem`} cx="0.38" cy="0.34" r="0.7">
          <stop offset="0" stopColor="#9fb2ff" />
          <stop offset="0.35" stopColor="#3f55c9" />
          <stop offset="0.8" stopColor="#1b2479" />
          <stop offset="1" stopColor="#0d1150" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-5%" y="-20%" width="110%" height="150%">
          <feDropShadow dx="0" dy="0.8" stdDeviation="0.7" floodColor="#000000" floodOpacity="0.35" />
        </filter>
      </defs>
      <g transform={`translate(${WORD_X} ${BASELINE}) scale(${SCALE})`} filter={`url(#${id}-shadow)`}>
        <path d={WORD} fill={`url(#${id}-metal)`} style={{ stroke: "var(--logo-edge, rgb(20 20 40 / 0.5))" }} strokeWidth="22" paintOrder="stroke" />
        <path d={WORD} fill={`url(#${id}-sheen)`} />
        <Sapphire id={id} />
      </g>
    </svg>
  );
}
