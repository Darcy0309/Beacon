"use client";

import { usePathname } from "next/navigation";
import SnowBackdrop from "@/components/snow-backdrop";

export default function Backdrop() {
  const path = usePathname();

  // The login screen renders its own richer background.
  if (path === "/login") return null;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <SnowBackdrop />
    </div>
  );
}
