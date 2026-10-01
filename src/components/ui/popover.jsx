"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

function Popover(props) {
  return <PopoverPrimitive.Root {...props} />;
}
function PopoverTrigger(props) {
  return <PopoverPrimitive.Trigger {...props} />;
}
function PopoverAnchor(props) {
  return <PopoverPrimitive.Anchor {...props} />;
}

/**
 * Floating panel. Radix keeps it above dialogs (Escape and outside clicks
 * close the panel, not the dialog underneath), flips it above its anchor
 * when there is no room below, and portals it out of cards that clip.
 */
function PopoverContent({ className, sideOffset = 6, align = "start", ...props }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          "animate-popover-in z-50 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl outline-none",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
