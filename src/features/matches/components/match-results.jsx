"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setMatchResults } from "@/features/matches/actions";
import { cn } from "@/lib/utils";

/**
 * Which call results a match's record may have (Sean, Nov 2026): a renewal date on a Lead-Disco# or
 * an invalid lead is no match. Each result ticked qualifies; one name stands for it on both lists.
 */
export default function MatchResults({ names, excluded }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [off, setOff] = useState(() => new Set(excluded));
  const [pending, start] = useTransition();
  const changed = off.size !== excluded.length || excluded.some((n) => !off.has(n));
  const toggle = (name) => setOff((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const save = () => start(async () => {
    const res = await setMatchResults([...off]);
    if (!res?.ok) return void toast.error(res?.error ?? "Not saved.");
    toast.success("Saved: the matches are found again with these call results.");
    router.refresh();
  });

  return (
    <div className="border-b border-[var(--panel-border)]" data-match-results>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-sm hover:bg-muted/40" data-match-results-open>
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="font-medium">Call results that qualify a match</span>
        <span className="ml-auto text-xs text-muted-foreground">{(names.length - off.size).toLocaleString()} of {names.length.toLocaleString()} · left out: {[...off].join(", ") || "none"}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-[var(--panel-border)] px-5 py-3">
          <p className="text-xs text-muted-foreground">A record elsewhere brings its renewal dates in only with a call result ticked here.</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
            {names.map(({ name, types }) => (
              <label key={name} className={cn("flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50", off.has(name) && "text-muted-foreground")}>
                <input type="checkbox" checked={!off.has(name)} onChange={() => toggle(name)} className="size-4 accent-[var(--primary)]" data-match-result={name} />
                <span className="flex-1">{name}</span>
                <span className="text-[0.62rem] uppercase tracking-wider text-muted-foreground">{types.map((t) => (t === "DBDV" ? "DB Dev" : "Appt")).join(" · ")}</span>
              </label>
            ))}
          </div>
          <Button type="button" size="sm" onClick={save} disabled={!changed || pending} data-match-results-save>
            {pending ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}
