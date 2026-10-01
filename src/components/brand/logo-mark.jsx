"use client";

import { useId } from "react";
import { MARK } from "@/components/brand/logo-paths";

/** A per-instance id safe inside url(#…): two logos on one page (the sidebar and its phone menu) must not share gradients. */
export function useLogoId() {
  return `logo${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * The Signature sphere: a blue lobe and a purple lobe either side of an
 * S-shaped gap, each with a darker leaf notched off at the rim, in a soft
 * glow. Drawn in a 64 x 64 box (centre 32, 32) and shared by the icon and
 * the wordmark. The glow colour is --logo-glow (globals.css).
 */
export function SphereGlyph({ id }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-light`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#6aa6dd" />
          <stop offset="1" stopColor="#4f8bc6" />
        </linearGradient>
        <linearGradient id={`${id}-dark`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#4878b3" />
          <stop offset="1" stopColor="#3a669f" />
        </linearGradient>
        <linearGradient id={`${id}-purple`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#85309a" />
          <stop offset="1" stopColor="#722688" />
        </linearGradient>
        <linearGradient id={`${id}-cap`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#78298c" />
          <stop offset="1" stopColor="#611e74" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.25" result="blur" />
          <feFlood style={{ floodColor: "var(--logo-glow, #d4e9ff)" }} floodOpacity="0.8" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-glow)`}>
        <path d={MARK.light} fill={`url(#${id}-light)`} />
        <path d={MARK.dark} fill={`url(#${id}-dark)`} />
        <path d={MARK.purple} fill={`url(#${id}-purple)`} />
        <path d={MARK.cap} fill={`url(#${id}-cap)`} />
      </g>
    </>
  );
}

/** Icon-only mark, for the collapsed sidebar rail. */
export default function LighthouseMark({ className }) {
  const id = useLogoId();
  return (
    <svg viewBox="2 2 60 60" className={className} role="img" aria-label="Lighthouse">
      <SphereGlyph id={id} />
    </svg>
  );
}
