"use client";

import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function Sheet(props) {
  return <SheetPrimitive.Root {...props} />;
}
function SheetTrigger(props) {
  return <SheetPrimitive.Trigger {...props} />;
}
function SheetClose(props) {
  return <SheetPrimitive.Close {...props} />;
}

function SheetContent({ className, children, side = "left", ...props }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <SheetPrimitive.Content
        className={cn(
          "fixed z-50 flex h-full flex-col bg-sidebar text-sidebar-foreground shadow-xl outline-none transition-transform",
          side === "left" && "inset-y-0 left-0 w-72 border-r border-sidebar-border",
          side === "right" && "inset-y-0 right-0 w-72 border-l border-sidebar-border",
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm text-sidebar-foreground/70 opacity-80 outline-none transition-opacity hover:opacity-100">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetTitle({ className, ...props }) {
  return <SheetPrimitive.Title className={cn("text-sm font-semibold", className)} {...props} />;
}
function SheetDescription({ className, ...props }) {
  return <SheetPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
