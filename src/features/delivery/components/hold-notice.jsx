"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { markHoldFixed } from "@/features/delivery/hold-actions";

/**
 * On a lead sheet, when QA held its lead or appointment back from the client
 * (Sean, Oct 2026): what needs fixing, and Fixed, which puts it back in line
 * to go with the next batch (or an administrator's send).
 */
export default function HoldNotice({ hold }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fixed = () =>
    start(async () => {
      const f = new FormData();
      f.set("id", String(hold.id));
      const result = await markHoldFixed(f);
      if (result.ok) {
        toast.success("Marked fixed: it goes to the client with the next batch");
        router.refresh();
      } else toast.error(result.error);
    });
  return (
    <Card data-hold-notice={hold.id} className="border-rose-400/50 bg-rose-500/5 p-4 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-rose-500"><Ban className="size-4" /> Held back by QA: not sent to the client</p>
      <p className="mt-1 whitespace-pre-line text-muted-foreground">{hold.note}</p>
      <Button size="sm" className="mt-3" onClick={fixed} disabled={pending} data-hold-fixed><Check /> {pending ? "Saving…" : "Fixed: send it"}</Button>
    </Card>
  );
}
