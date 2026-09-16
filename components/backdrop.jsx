"use client";

import { usePathname } from "next/navigation";
import PageMotif from "@/components/page-motif";

export default function Backdrop() {
  const path = usePathname();

  if (path === "/login") return null;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="app-atmosphere absolute inset-0" />
      <div
        aria-hidden
        className="animate-mesh-drift absolute -left-1/4 top-0 size-[70vmax] rounded-full opacity-40 blur-3xl"
        style={{
          background: "radial-gradient(circle, color-mix(in oklch, var(--primary) 18%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="animate-mesh-drift absolute -right-1/5 bottom-0 size-[50vmax] rounded-full opacity-35 blur-3xl"
        style={{
          background: "radial-gradient(circle, color-mix(in oklch, var(--beacon) 16%, transparent), transparent 70%)",
          animationDelay: "-9s",
        }}
      />
      <PageMotif path={path} className="absolute bottom-8 right-8 w-[min(42vw,480px)] text-primary opacity-[0.06]" />
    </div>
  );
}
