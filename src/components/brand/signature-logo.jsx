"use client";

import { Questrial } from "next/font/google";
import { SphereGlyph, useLogoId } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";

// A light geometric sans, as in the Signature Marketing logotype.
const logotype = Questrial({ subsets: ["latin"], weight: "400", display: "swap" });

/**
 * The Signature Marketing logo, as the business uses it: the sphere, with
 * "Signature" and "MARKETING" set beside it. Drawn rather than pictured, so
 * it is sharp at any size and its words take the colour of the text around
 * them (dark on a light theme, light on the dark one). The emailed lead
 * sheet uses the business's own image of it (public/brand).
 */
export default function SignatureLogo({ className }) {
  const id = useLogoId();
  return (
    <span role="img" aria-label="Signature Marketing" className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="2 2 60 60" className="size-11 shrink-0" aria-hidden>
        <SphereGlyph id={id} />
      </svg>
      <span className={cn(logotype.className, "flex flex-col leading-none")} aria-hidden>
        <span className="text-[1.7rem] tracking-[-0.01em]">Signature</span>
        <span className="-mt-0.5 self-end text-[0.62rem] tracking-[0.18em] opacity-85">MARKETING</span>
      </span>
    </span>
  );
}
