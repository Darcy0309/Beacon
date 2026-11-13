"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileCheck2 } from "lucide-react";
import { setProjectDecSheetRate } from "@/features/pay/extras-actions";
import { reach } from "@/lib/reach";

const CHOICES = [5, 10, 15, 20, 25];

/**
 * A project's Dec Sheet Pay (Sean, Nov 2026): what a manager is paid, once a lead, for getting the
 * prospect's policy information on it. $5 to $25; an administrator or the client's Sales Rep sets it.
 */
export default function DecSheetRate({ projectId, rate = 10 }) {
  const router = useRouter();
  const [value, setValue] = useState(String(Number(rate)));
  const [pending, start] = useTransition();
  const choices = CHOICES.includes(Number(rate)) ? CHOICES : [...CHOICES, Number(rate)].sort((a, b) => a - b);
  const change = (next) => {
    const was = value;
    setValue(next);
    start(async () => {
      const f = new FormData();
      f.set("project_id", String(projectId));
      f.set("rate", next);
      const result = await reach(() => setProjectDecSheetRate(f));
      if (!result?.ok) {
        setValue(was);
        return void toast.error(result?.error || "The dec sheet rate could not be saved.");
      }
      toast.success(`Dec Sheet Pay is $${result.data.rate} a lead on this project`);
      router.refresh();
    });
  };
  return (
    <label className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--panel-border)] bg-muted/20 px-2 text-xs" title="Paid once a lead to the manager who gets the prospect's policy information" data-dec-sheet-rate>
      <FileCheck2 className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">Dec sheet</span>
      <select value={value} onChange={(e) => change(e.target.value)} disabled={pending} aria-label="Dec Sheet Pay"
        className="cursor-pointer bg-transparent font-semibold tabular-nums outline-none">
        {choices.map((c) => <option key={c} value={String(c)}>${c}</option>)}
      </select>
    </label>
  );
}
