"use client";

import { useId } from "react";
import {
  SPHERE_LEFT, SPHERE_LEFT_STOPS, SPHERE_RIGHT, SPHERE_RIGHT_STOPS, WORD_MARKETING, WORD_SIGNATURE,
} from "@/components/brand/signature-paths";
import { cn } from "@/lib/utils";

const stops = (colors) =>
  colors.map((c, i) => <stop key={c + i} offset={i / (colors.length - 1)} stopColor={c} />);

/**
 * The Signature Marketing logo: the business's own artwork, rebuilt as vector
 * art (signature-paths.js), so it is sharp at any size. The sphere keeps its
 * colours; the words take the colour of the text around them (dark on a
 * light theme, light on the dark one). The emailed lead sheet uses the same
 * artwork as an image (public/brand).
 */
export default function SignatureLogo({ className }) {
  const id = `sm${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 266 104" className={cn("h-12 w-auto", className)} role="img" aria-label="Signature Marketing">
      <defs>
        <linearGradient id={`${id}L`} x1="0.15" y1="0" x2="0.55" y2="1">{stops(SPHERE_LEFT_STOPS)}</linearGradient>
        <linearGradient id={`${id}R`} x1="0.3" y1="0" x2="0.7" y2="1">{stops(SPHERE_RIGHT_STOPS)}</linearGradient>
        <filter id={`${id}S`} x="-10%" y="-10%" width="125%" height="125%">
          <feDropShadow dx="0.8" dy="1.2" stdDeviation="1" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter={`url(#${id}S)`} transform="scale(0.125)">
        <path d={SPHERE_LEFT} fill={`url(#${id}L)`} stroke="#fff" strokeOpacity="0.45" strokeWidth="5" />
        <path d={SPHERE_RIGHT} fill={`url(#${id}R)`} stroke="#fff" strokeOpacity="0.25" strokeWidth="5" />
      </g>
      <path d={WORD_SIGNATURE} fill="currentColor" />
      <path d={WORD_MARKETING} fill="currentColor" stroke="currentColor" strokeWidth="0.35" strokeLinejoin="round" />
    </svg>
  );
}
