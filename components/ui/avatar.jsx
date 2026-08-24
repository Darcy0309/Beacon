import { cn } from "@/lib/utils";

function Avatar({ className, ...props }) {
  return (
    <div
      className={cn("relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white", className)}
      {...props}
    />
  );
}

export { Avatar };
