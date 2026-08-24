"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import SidebarNav from "@/components/sidebar-nav";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="flex size-9 items-center justify-center rounded-md border bg-card text-muted-foreground transition-all duration-150 hover:bg-accent active:scale-95 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
