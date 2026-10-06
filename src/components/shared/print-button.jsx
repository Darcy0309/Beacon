"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Print the page. `compact`: the icon alone, for a tight row of actions. */
export default function PrintButton({ children = "Print", variant = "outline", compact = false }) {
  return (
    <Button variant={variant} size={compact ? "icon" : "sm"} className={compact ? "size-8" : undefined} aria-label={compact ? "Print" : undefined} onClick={() => window.print()}>
      <Printer /> {compact ? null : children}
    </Button>
  );
}
