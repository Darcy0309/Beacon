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
        collapsed ? "md:w-16" : "md:w-60"
      )}
    >
      <SidebarNav />
    </aside>
  );
}
