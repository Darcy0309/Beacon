"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { saveDashboardLayout } from "@/features/dashboard/actions";
import { reach } from "@/lib/reach";

/**
 * A dashboard section collapsed to its title (Sean, Nov 2026: a customizable dashboard); Expand opens it again and
 * keeps it open. `layout` the person's whole layout (null: not theirs to change, an administrator viewing a manager's).
 */
export default function CollapsedSection({ kind, id, label, layout }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const expand = () => start(async () => {
    const result = await reach(() => saveDashboardLayout({ kind, layout: { ...layout, collapsed: layout.collapsed.filter((x) => x !== id) } }));
    if (!result.ok) return void toast.error(result.error);
    router.refresh();
  });
  return (
    <Card data-collapsed-section={id}>
      <button type="button" onClick={layout ? expand : undefined} disabled={!layout || pending}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left enabled:cursor-pointer enabled:hover:bg-muted/40" data-expand-section={id}>
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-muted-foreground/50" />
          <span className="eyebrow">{label}</span>
        </span>
        {layout ? (
          <span className="flex items-center gap-1 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary">
            {pending ? <Loader2 className="size-3 animate-spin" /> : <ChevronDown className="size-3" />} Expand
          </span>
        ) : null}
      </button>
    </Card>
  );
}
