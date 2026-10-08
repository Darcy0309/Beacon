"use client";

import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dialogs: Radix for what a dialog must do (focus kept inside, Escape and a
 * click outside close it, the page behind left alone, screen readers told),
 * Motion for how it moves. On a desktop it springs up into the middle of the
 * screen and settles; on a phone it is a sheet that rises from the bottom
 * and is dragged down by its handle to close. Closing plays it backwards.
 * Someone who asked their system for less motion gets a plain fade.
 */

const DialogState = createContext({ open: false, setOpen: () => {} });

/** Open or closed, as the caller says (`open`) or on its own (a DialogTrigger). */
function Dialog({ open: openProp, defaultOpen = false, onOpenChange, children, ...props }) {
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
    <DialogState.Provider value={{ open, setOpen }}>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen} {...props}>
        {children}
      </DialogPrimitive.Root>
    </DialogState.Provider>
  );
}
function DialogTrigger(props) {
  return <DialogPrimitive.Trigger {...props} />;
}
function DialogClose(props) {
  return <DialogPrimitive.Close {...props} />;
}

// A phone: under Tailwind's `sm`, where dialogs become bottom sheets.
const PHONE = "(max-width: 639px)";
const subscribe = (onChange) => {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const usePhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);

const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 };
const MOTION = {
  desktop: {
    initial: { opacity: 0, scale: 0.94, y: 12, filter: "blur(6px)" },
    animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", transition: SPRING },
    exit: { opacity: 0, scale: 0.97, y: 6, filter: "blur(2px)", transition: { duration: 0.12, ease: "easeIn" } },
  },
  phone: {
    initial: { y: "100%" },
    animate: { y: 0, transition: { type: "spring", stiffness: 380, damping: 38 } },
    exit: { y: "100%", transition: { duration: 0.18, ease: "easeIn" } },
  },
  reduced: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.15 } },
    exit: { opacity: 0, transition: { duration: 0.1 } },
  },
};

/**
 * The dialog itself. Never taller than the screen: a form longer than the
 * room scrolls inside the box, and its DialogFooter (Save, Cancel) stays
 * pinned at the bottom.
 */
function DialogContent({ className, children, ...props }) {
  const { open, setOpen } = useContext(DialogState);
  const reduced = useReducedMotion();
  const phone = usePhone();
  const drag = useDragControls();
  const moves = reduced ? MOTION.reduced : phone ? MOTION.phone : MOTION.desktop;

  return (
    <AnimatePresence>
      {open ? (
        <DialogPrimitive.Portal key="dialog" forceMount>
          <DialogPrimitive.Overlay forceMount asChild>
            <motion.div
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.2 } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
            />
          </DialogPrimitive.Overlay>
          {/* Centres the box on a desktop and seats it on the bottom edge on a
              phone; clicks pass through it to the overlay. */}
          <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <DialogPrimitive.Content forceMount asChild {...props}>
              <motion.div
                data-dialog-content
                {...moves}
                // A phone's sheet follows the handle down, and goes when let go far or fast enough.
                drag={phone && !reduced ? "y" : false}
                dragControls={drag}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.7 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 110 || info.velocity.y > 650) setOpen(false);
                }}
                className={cn(
                  // No padding at the bottom: the footer brings its own, so it can sit on the
                  // very edge while the fields scroll (globals.css pads a box without one).
                  "pointer-events-auto relative flex max-h-[92svh] w-full max-w-lg flex-col gap-4 overflow-y-auto overscroll-contain border bg-card px-5 pt-5 text-card-foreground outline-none",
                  "rounded-t-2xl shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.45)]",
                  "sm:max-h-[90svh] sm:w-[calc(100vw-2rem)] sm:rounded-xl sm:shadow-[0_24px_70px_-20px_rgb(0_0_0/0.55),0_0_0_1px_color-mix(in_srgb,var(--primary)_12%,transparent)]",
                  className
                )}
              >
                {phone ? (
                  <div
                    data-dialog-handle
                    aria-hidden
                    onPointerDown={(event) => drag.start(event)}
                    className="-mx-5 -mt-3 -mb-2 flex shrink-0 cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
                  >
                    <span className="h-1.5 w-10 rounded-full bg-muted-foreground/35" />
                  </div>
                ) : null}
                {children}
                <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-0.5 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40">
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </motion.div>
            </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

function DialogHeader({ className, ...props }) {
  return <div className={cn("flex flex-col gap-1 pr-8", className)} {...props} />;
}

function DialogFooter({ className, ...props }) {
  return (
    <div
      data-dialog-footer
      className={cn("sticky bottom-0 z-10 -mx-5 flex shrink-0 flex-wrap items-center justify-end gap-2 bg-card px-5 pb-5 pt-1", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      className={cn("text-base font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
