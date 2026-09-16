import { cn } from "@/lib/utils";

function Card({ className, ...props }) {
  return (
    <div
      data-card
      className={cn(
        "relative rounded-2xl border border-border/80 bg-card text-card-foreground shadow-[0_1px_2px_rgb(15_30_55_/0.04),0_8px_24px_-12px_rgb(15_30_55_/0.1)]",
        className
      )}
      {...props}
    />
  );
}
function CardHeader({ className, ...props }) {
  return <div className={cn("flex items-center justify-between gap-2 p-5 pb-4", className)} {...props} />;
}
function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-[0.95rem] font-semibold leading-none tracking-tight", className)} {...props} />;
}
function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
function CardContent({ className, ...props }) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
function CardFooter({ className, ...props }) {
  return <div className={cn("flex items-center p-5 pt-0", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
