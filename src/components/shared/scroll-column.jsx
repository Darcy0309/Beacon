"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A column that scrolls on its own (the lead sheet's right side on a short screen), and says so (Nov 2026:
 * the Call Result cut off under the calendar, nothing to tell there was more): while there is more below,
 * a fade along its foot and a bouncing "More below" that scrolls on when pressed. Gone at the bottom, and
 * wherever the column doesn't scroll (its `className` decides when it does).
 */
export default function ScrollColumn({ className, children, ...props }) {
  const box = useRef(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const check = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 12);
    check();
    // Its parts grow and shrink (the calendar's month, a result opened): looked at again each time.
    const sizes = new ResizeObserver(check);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(el);
      for (const child of el.children) sizes.observe(child);
    };
    watch();
    const parts = new MutationObserver(() => { watch(); check(); });
    parts.observe(el, { childList: true });
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      sizes.disconnect();
      parts.disconnect();
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const scrollOn = () => {
    const el = box.current;
    if (el) el.scrollBy({ top: Math.max(160, el.clientHeight * 0.7), behavior: "smooth" });
  };

  return (
    <div ref={box} className={className} {...props}>
      {children}
      {/* Pinned to the column's foot as it scrolls; takes no room of its own. */}
      <div aria-hidden={!more} className={cn("pointer-events-none sticky bottom-0 z-10 !mt-0 h-0 transition-opacity duration-300", more ? "opacity-100" : "opacity-0")} data-more-below={more || undefined}>
        <div className="absolute inset-x-0 bottom-0 flex h-20 items-end justify-center bg-gradient-to-t from-background via-background/70 to-transparent pb-2">
          <button type="button" onClick={scrollOn} tabIndex={more ? 0 : -1}
            className={cn("flex items-center gap-1 rounded-full border border-primary/40 bg-card/95 px-3 py-1 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary shadow-lg backdrop-blur transition-colors hover:bg-primary/10 motion-safe:animate-bounce",
              more && "pointer-events-auto")}>
            <ChevronsDown className="size-3.5" aria-hidden /> More below
          </button>
        </div>
      </div>
    </div>
  );
}
