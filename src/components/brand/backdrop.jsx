"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import SnowBackdrop from "@/components/brand/snow-backdrop";
import PageMotif from "@/components/brand/page-motif";
import LiveWallpaper, { LIVE_SCENES } from "@/components/brand/live-wallpaper";

/** The wallpaper chosen under Appearance (html[data-wallpaper]), as it changes. */
function useWallpaper() {
  const [wallpaper, setWallpaper] = useState(null);
  useEffect(() => {
    const d = document.documentElement;
    const read = () => setWallpaper(d.dataset.wallpaper ?? null);
    read();
    const watch = new MutationObserver(read);
    watch.observe(d, { attributes: true, attributeFilter: ["data-wallpaper"] });
    return () => watch.disconnect();
  }, []);
  return wallpaper;
}

export default function Backdrop() {
  const path = usePathname();
  const wallpaper = useWallpaper();

  // The login screen renders its own richer background.
  if (path === "/login" || path === "/setup") return null;

  // A live wallpaper (Appearance) is drawn here, in place of the snow.
  const live = LIVE_SCENES.includes(wallpaper) ? wallpaper : null;
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {live ? <LiveWallpaper scene={live} /> : null}
      <PageMotif path={path} className="absolute bottom-6 right-6 w-[min(46vw,540px)] text-primary opacity-[0.09]" />
      {live ? null : <SnowBackdrop />}
    </div>
  );
}
