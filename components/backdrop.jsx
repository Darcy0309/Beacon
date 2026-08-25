"use client";

import { usePathname } from "next/navigation";
import SnowBackdrop from "@/components/snow-backdrop";
import PageMotif from "@/components/page-motif";

export default function Backdrop() {
  const path = usePathname();

  // The login screen renders its own richer background.
  if (path === "/login") return null;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <PageMotif path={path} className="absolute bottom-6 right-6 w-[min(46vw,540px)] text-primary opacity-[0.09]" />
      <SnowBackdrop />
    </div>
  );
}
