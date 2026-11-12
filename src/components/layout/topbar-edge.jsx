"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The top bar's edge in motion (client, Nov 2026: "so that I can see clearly topbar and main page"):
 * a small, soft oval of light leaving the middle of the title's tab for each side at once, up its
 * slope and along the bar's foot to the end, fading as it goes; then again, after a rest. Kept gentle.
 * Drawn over the bar's own edge, measured from where the tab is (it moves with the title's width
 * and the window's). Still for people who ask their computer for less motion (globals.css).
 *
 *   bar    the bar's height, px; drop  how far the tab hangs below it; slope  its sides' run
 */
export default function TopbarEdge({ bar, drop, slope }) {
  const ref = useRef(null);
  const [paths, setPaths] = useState(null);

  useEffect(() => {
    const header = ref.current?.parentElement;
    const tab = header?.querySelector("[data-topbar-tab]");
    if (!header || !tab) return;
    const draw = () => {
      const h = header.getBoundingClientRect();
      const t = tab.getBoundingClientRect();
      const l = t.left - h.left;
      const r = t.right - h.left;
      const y = bar - 0.5;
      const y2 = bar + drop - 0.5;
      const mid = (l + r) / 2;
      // From the middle of the tab's foot out to each end.
      setPaths([
        `M${mid} ${y2} H${l + slope} L${l} ${y} H0`,
        `M${mid} ${y2} H${r - slope} L${r} ${y} H${h.width}`,
      ]);
    };
    draw();
    const seen = new ResizeObserver(draw);
    seen.observe(header);
    seen.observe(tab);
    return () => seen.disconnect();
  }, [bar, drop, slope]);

  return (
    <svg ref={ref} aria-hidden data-topbar-edge className="pointer-events-none absolute inset-x-0 top-0 overflow-visible" width="100%" height={bar + drop}>
      <defs>
        {/* Softened into an oval rather than a hard dash. */}
        <filter id="topbar-edge-soft" filterUnits="userSpaceOnUse" x="-50" y="0" width="10000" height={bar + drop + 20}>
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      {paths?.map((d) => <path key={d.slice(0, 12) + d.length} d={d} pathLength="1000" className="topbar-edge-glow" filter="url(#topbar-edge-soft)" />)}
    </svg>
  );
}
