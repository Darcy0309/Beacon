"use client";

import SidebarNav from "@/components/layout/sidebar-nav";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { cn } from "@/lib/utils";

/**
 * The side menu, floating (Nov 2026): a rounded panel held off the window's edges, a shadow
 * under it, rather than a strip running to the edges. The gap around it is the aside's padding,
 * so the panel keeps its width (15rem, 4rem collapsed).
 */
export default function AppSidebar() {
  const { collapsed } = useSidebar();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 py-3 pl-3 transition-[width] duration-300 ease-in-out md:block",
        collapsed ? "md:w-[4.75rem]" : "md:w-[15.75rem]"
      )}
    >
      <div
        data-sidebar-panel
        className="relative h-full overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar/80 text-sidebar-foreground shadow-[0_10px_30px_-12px_rgb(0_0_0/0.25),0_2px_6px_-2px_rgb(0_0_0/0.08)] dark:shadow-[0_12px_32px_-10px_rgb(0_0_0/0.7),0_2px_8px_-2px_rgb(0_0_0/0.4)]"
      >
        <div aria-hidden className="grid-veil pointer-events-none absolute inset-0 opacity-[0.5]" />
        <div className="relative h-full">
          <SidebarNav />
        </div>
      </div>
    </aside>
  );
}
