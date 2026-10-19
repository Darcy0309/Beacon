"use client";

import { SphereGlyph, useLogoId } from "@/components/brand/logo-mark";

/**
 * The page on its way (Sean, Oct 2026): the Signature sphere, breathing, with
 * a cyan light and a purple one running around it in opposite directions,
 * under a header the height of the page's own so nothing jumps when it
 * lands. It fades in a beat late, so a page that arrives at once never
 * flashes it. Still, with a slow pulse, for anyone who turns motion off
 * (globals.css, .page-loader).
 */
export default function PageLoader({ label = "Loading" }) {
  const id = useLogoId();
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" data-page-loader>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--panel-border)] bg-background/85 px-4 py-3 backdrop-blur sm:px-6">
        <div className="space-y-2">
          <div className="h-3.5 w-36 animate-pulse rounded bg-muted" />
          <div className="h-3 w-56 animate-pulse rounded bg-muted/60" />
        </div>
      </header>
      <div className="page-loader grid min-h-[60vh] flex-1 place-items-center p-6" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-5">
          <div className="page-loader-mark" aria-hidden>
            <span className="page-loader-orbit page-loader-orbit-out"><span className="page-loader-ring" /><span className="page-loader-head" /></span>
            <span className="page-loader-orbit page-loader-orbit-in"><span className="page-loader-ring" /><span className="page-loader-head" /></span>
            <svg viewBox="0 0 64 64" className="page-loader-sphere">
              <SphereGlyph id={id} />
            </svg>
          </div>
          <p className="eyebrow text-muted-foreground">
            {label}<span className="page-loader-dots" aria-hidden><span>.</span><span>.</span><span>.</span></span>
          </p>
        </div>
      </div>
    </div>
  );
}
