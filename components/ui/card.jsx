import { cn } from "@/lib/utils";

function Card({ className, ...props }) {
  return (
    <div
      data-card
      className={cn(
        "relative rounded-xl border bg-card/70 text-card-foreground shadow-sm backdrop-blur-sm transition-all duration-200 supports-[backdrop-filter]:bg-card/62 hover:z-10 hover:scale-[1.005] hover:shadow-md",
        className
      )}
      {...props}
    />
  );
}
function CardHeader({ className, ...props }) {
  return <div className={cn("flex items-center justify-between gap-2 p-5", className)} {...props} />;
}
function CardTitle({ className, ...props }) {
  return <h3 className={cn("font-semibold leading-none tracking-tight", className)} {...props} />;
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
