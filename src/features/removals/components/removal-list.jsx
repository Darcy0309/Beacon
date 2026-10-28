"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import Link from "@/components/shared/intent-link";
import ToneBadge from "@/components/shared/tone-badge";
import { forgetRemoval } from "@/features/removals/actions";
import { reach } from "@/lib/reach";
import { cn } from "@/lib/utils";

const TONE = { deletion: "rose", dont_call: "amber", current_customer: "sky" };
const FILTERS = [["all", "All"], ["deletion", "Deletion"], ["dont_call", "Don't call"], ["current_customer", "Current customer"]];

/**
 * A client's removal list on their page (administrators): the names left
 * off their lists and why, newest first; one taken off it may come back on
 * a later list.
 */
export default function RemovalList({ rows, totals }) {
  const router = useRouter();
  const [show, setShow] = useState("all");
  const [busy, setBusy] = useState(null);
  const [, startTransition] = useTransition();
  const list = show === "all" ? rows : rows.filter((r) => r.reasonCode === show);

  const forget = (r) => {
    setBusy(r.id);
    startTransition(async () => {
      const res = await reach(() => forgetRemoval(r.id));
      setBusy(null);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`${r.company} is off the removal list`, { description: "A later list may bring it again." });
      router.refresh();
    });
  };

  return (
    <div data-removal-list>
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--panel-border)] px-5 py-2 text-xs">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setShow(key)} data-removal-filter={key}
            className={cn("rounded-full border px-2.5 py-0.5 transition-colors",
              show === key ? "border-primary/50 bg-primary/10 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:text-foreground")}>
            {label} <span className="tabular-nums">{(totals[key] ?? 0).toLocaleString()}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          {totals.all ? "None of these among the latest." : "No names taken off yet. Names the client takes off, and duplicates left off their lists, are kept here and left out of lists pulled later."}
        </p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-[var(--panel-border)] overflow-y-auto">
          {list.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm" data-removal={r.id}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {r.leadId ? <Link href={`/leads/${r.leadId}`} className="hover:text-primary">{r.company}</Link> : r.company}
                  <span className="font-normal text-muted-foreground">{[r.contact, r.place, r.phone].filter(Boolean).map((v) => ` · ${v}`).join("")}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[r.why, r.by ? `by ${r.by}` : null, r.date].filter(Boolean).join(" · ")}
                </div>
              </div>
              <ToneBadge tone={TONE[r.reasonCode] ?? "slate"}>{r.reason}</ToneBadge>
              <button type="button" onClick={() => forget(r)} disabled={busy === r.id} title="Take off the removal list"
                aria-label={`Take ${r.company} off the removal list`} data-removal-forget={r.id}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
                {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {totals.all > rows.length ? <p className="border-t border-[var(--panel-border)] px-5 py-2 text-xs text-muted-foreground">The latest {rows.length.toLocaleString()} of {totals.all.toLocaleString()}.</p> : null}
    </div>
  );
}
