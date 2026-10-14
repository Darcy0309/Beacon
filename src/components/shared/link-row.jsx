"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A table row that opens a page when it is clicked anywhere, or with Enter
 * on it. A link, button or field inside it still does its own thing; give
 * the row's name a real link too, for opening in a new tab.
 */
export default function LinkRow({ href, className, children, ...props }) {
  const router = useRouter();
  const open = (e) => {
    if (e.target.closest("a, button, input, select, textarea, [role=menuitem]")) return;
    router.push(href);
  };
  return (
    <TableRow {...props} tabIndex={0} data-row-link={href} className={cn("cursor-pointer", className)}
      onClick={open} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) router.push(href); }}>
      {children}
    </TableRow>
  );
}
