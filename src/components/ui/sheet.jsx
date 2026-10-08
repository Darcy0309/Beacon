"use client";

import { createContext, useCallback, useContext, useState } from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A panel from the side of the screen (the phone's menu): Radix for focus,
 * Escape and the page behind, Motion for how it moves. It slides in on a
 * spring, follows a finger swiped back towards its edge, and closes when let
 * go far or fast enough. Less motion asked for: a fade.
 */

const SheetState = createContext({ open: false, setOpen: () => {} });

function Sheet({ open: openProp, defaultOpen = false, onOpenChange, children, ...props }) {
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const setOpen = useCallback(
    (next) => {
      if (openProp === undefined) setOwn(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange]
  );
  return (
    <SheetState.Provider value={{ open, setOpen }}>
      <SheetPrimitive.Root open={open} onOpenChange={setOpen} {...props}>
        {children}
      </SheetPrimitive.Root>
    </SheetState.Provider>
  );
}
function SheetTrigger(props) {
  return <SheetPrimitive.Trigger {...props} />;
}
function SheetClose(props) {
  return <SheetPrimitive.Close {...props} />;
}

function SheetContent({ className, children, side = "left", ...props }) {
  const { open, setOpen } = useContext(SheetState);
  const reduced = useReducedMotion();
  const away = side === "left" ? "-100%" : "100%";
  const sign = side === "left" ? -1 : 1;

  return (
    <AnimatePresence>
      {open ? (
        <SheetPrimitive.Portal key="sheet" forceMount>
          <SheetPrimitive.Overlay forceMount asChild>
            <motion.div
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.2 } }}
              exit={{ opacity: 0, transition: { duration: 0.18 } }}
            />
          </SheetPrimitive.Overlay>
          <SheetPrimitive.Content forceMount asChild {...props}>
            <motion.div
              initial={reduced ? { opacity: 0 } : { x: away }}
              animate={reduced ? { opacity: 1 } : { x: 0, transition: { type: "spring", stiffness: 380, damping: 38 } }}
              exit={reduced ? { opacity: 0 } : { x: away, transition: { duration: 0.2, ease: "easeIn" } }}
              drag={reduced ? false : "x"}
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={side === "left" ? { left: 0.7, right: 0 } : { left: 0, right: 0.7 }}
              onDragEnd={(_, info) => {
                if (info.offset.x * sign > 90 || info.velocity.x * sign > 550) setOpen(false);
              }}
              className={cn(
                "fixed z-50 flex h-full flex-col bg-sidebar text-sidebar-foreground shadow-[0_0_60px_-10px_rgb(0_0_0/0.6)] outline-none",
                side === "left" && "inset-y-0 left-0 w-72 border-r border-sidebar-border",
                side === "right" && "inset-y-0 right-0 w-72 border-l border-sidebar-border",
                className
              )}
            >
              {children}
              <SheetPrimitive.Close className="absolute right-4 top-4 rounded-md p-0.5 text-sidebar-foreground/70 opacity-80 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </SheetPrimitive.Close>
            </motion.div>
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

function SheetTitle({ className, ...props }) {
  return <SheetPrimitive.Title className={cn("text-sm font-semibold", className)} {...props} />;
}
function SheetDescription({ className, ...props }) {
  return <SheetPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
