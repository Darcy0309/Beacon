"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { blockDays, blockHours } from "@/lib/project-calendar";
import { removeCalendarBlock } from "@/features/calendar/actions";
import { BlockDialog } from "@/features/calendar/components/project-calendar";

/**
 * A project calendar's blocked time, in a line: each block still to come
 * (its days, its hours, its note) with a way to take it off, and Block out
 * time. For the Calendar page's toolbar, where the month below shades the
 * same days. `blocks`: getProjectCalendar()'s, from today on. `children`:
 * more for the line (Sync my calendar).
 */
export default function BlockedTime({ projectId, blocks: every, today, children }) {
  // Blocked out by hand, each named; busy times from connected calendars, counted.
  const blocks = every.filter((b) => !b.synced);
  const synced = every.length - blocks.length;
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, startRemoving] = useTransition();
  const remove = (id) =>
    startRemoving(async () => {
      const f = new FormData();
      f.set("id", String(id));
      const result = await removeCalendarBlock(f);
      if (result.ok) {
        toast.success("Taken off the calendar");
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2" data-blocked-time>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
      {blocks.slice(0, 4).map((b) => (
        <span key={b.id} data-block={b.id} title={[b.note, b.by ? `by ${b.by}` : null].filter(Boolean).join(" · ") || undefined}
          className="inline-flex max-w-56 items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
          style={{ borderColor: "color-mix(in srgb, var(--neon-amber) 45%, transparent)", background: "color-mix(in srgb, var(--neon-amber) 8%, transparent)" }}>
          <Ban className="size-3 shrink-0" style={{ color: "var(--neon-amber)" }} />
          <span className="truncate">{blockDays(b)} · {blockHours(b)}{b.note ? ` · ${b.note}` : ""}</span>
          <button type="button" onClick={() => remove(b.id)} disabled={removing} aria-label={`Take the block on ${blockDays(b)} off the calendar`} data-remove-block
            className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-destructive"><X className="size-3" /></button>
        </span>
      ))}
      {blocks.length > 4 ? <span className="text-xs text-muted-foreground">+{blocks.length - 4} more</span> : null}
      {synced ? <span className="text-xs text-muted-foreground" data-synced-count>{synced} busy time{synced === 1 ? "" : "s"} from synced calendars</span> : null}
      {every.length === 0 ? <span className="text-xs text-muted-foreground">No time blocked out.</span> : null}
      </div>
      {children}
      <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setAdding(true)} data-block-out><Ban /> Block out time</Button>
      <BlockDialog open={adding} onOpenChange={setAdding} projectId={projectId} day={today}
        onDone={() => { setAdding(false); router.refresh(); }} />
    </div>
  );
}
