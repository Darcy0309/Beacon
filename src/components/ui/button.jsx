import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold uppercase tracking-[0.08em] transition-all duration-150 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 shrink-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_18px_-6px_var(--primary)]",
        accent:
          "bg-accent text-accent-foreground hover:brightness-110 shadow-[0_0_18px_-6px_var(--accent)]",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
        outline:
          "border border-primary/40 bg-primary/5 text-primary hover:bg-primary/12 hover:border-primary/60",
        secondary:
          "border border-[var(--panel-border)] bg-secondary text-secondary-foreground hover:bg-muted",
        ghost: "hover:bg-secondary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline normal-case tracking-normal",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 rounded-md px-3 text-[0.68rem]",
        lg: "h-10 rounded-md px-6",
        icon: "size-9 px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

function Button({ className, variant, size, asChild = false, ref, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
