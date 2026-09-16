"use client";

import SidebarNav from "@/components/sidebar-nav";
import { useSidebar } from "@/components/sidebar-provider";
import { cn } from "@/lib/utils";

export default function AppSidebar() {
  const { collapsed } = useSidebar();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out md:block",
        collapsed ? "md:w-[4.25rem]" : "md:w-64"
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60"
        style={{
          background: "radial-gradient(ellipse 80% 100% at 50% 0%, color-mix(in oklch, var(--beacon) 18%, transparent), transparent)",
        }}
      />
      <SidebarNav />
    </aside>
  );
}
