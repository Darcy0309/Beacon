"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function Dialog(props) {
  return <DialogPrimitive.Root {...props} />;
}
function DialogTrigger(props) {
  return <DialogPrimitive.Trigger {...props} />;
}
function DialogClose(props) {
  return <DialogPrimitive.Close {...props} />;
}

function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[90svh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-xl outline-none",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }) {
  return <div className={cn("flex flex-col gap-1 pr-8", className)} {...props} />;
}

function DialogFooter({ className, ...props }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2 pt-1", className)} {...props} />
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
