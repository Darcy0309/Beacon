"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { blockDays, blockHours } from "@/lib/project-calendar";
import { cn } from "@/lib/utils";
import { removeCalendarBlock } from "@/features/calendar/actions";
import { BlockDialog } from "@/features/calendar/components/project-calendar";
import ConfirmDialog from "@/components/shared/confirm-dialog";

/**
 * A project calendar's blocked time, in a line: each block still to come
 * (its days, its hours, its note) with a way to take it off, and Block out
 * time. For the Calendar page's toolbar, where the month below shades the
 * same days. The client's days to avoid (every week, from Project Info) show
 * here too, and are changed there. `blocks`: getProjectCalendar()'s, from today on. `children`:
 * more for the line (Sync my calendar). Without a `projectId` it is several
 * calendars together (a client's): each block names its project, and there
 * is nothing to add or take off until one calendar is chosen.
 */
export default function BlockedTime({ projectId = null, blocks: every, today, children }) {
  // Blocked out by hand, each named; busy times from connected calendars, counted.
  const blocks = every.filter((b) => !b.synced);
  const synced = every.length - blocks.length;
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState(null); // the block about to be taken off
  const [removing, startRemoving] = useTransition();
  const remove = (id) =>
    startRemoving(async () => {
      const f = new FormData();
      f.set("id", String(id));
      const result = await removeCalendarBlock(f);
      if (result.ok) {
        toast.success("Taken off the calendar");
        setAsking(null);
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2" data-blocked-time>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
      {blocks.slice(0, 4).map((b) => (
        <span key={b.id} data-block={b.id} title={[b.project, b.note, b.by ? `by ${b.by}` : null].filter(Boolean).join(" · ") || undefined}
          className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", projectId ? "max-w-56" : "max-w-80")}
          style={{ borderColor: "color-mix(in srgb, var(--neon-amber) 45%, transparent)", background: "color-mix(in srgb, var(--neon-amber) 8%, transparent)" }}>
          <Ban className="size-3 shrink-0" style={{ color: "var(--neon-amber)" }} />
          <span className="truncate">{blockDays(b)} · {blockHours(b)}{b.note ? ` · ${b.note}` : ""}{b.project ? ` · ${b.project}` : ""}</span>
          {/* The client's days to avoid change with their Project Info, not here. */}
          {projectId && !b.weekly ? (
            <button type="button" onClick={() => setAsking(b)} disabled={removing} aria-label={`Take the block on ${blockDays(b)} off the calendar`} data-remove-block
              className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-destructive"><X className="size-3" /></button>
          ) : null}
        </span>
      ))}
      {blocks.length > 4 ? <span className="text-xs text-muted-foreground">+{blocks.length - 4} more</span> : null}
      {synced ? <span className="text-xs text-muted-foreground" data-synced-count>{synced} busy time{synced === 1 ? "" : "s"} from synced calendars</span> : null}
      {every.length === 0 ? <span className="text-xs text-muted-foreground">No time blocked out.</span> : null}
      </div>
      {children}
      <ConfirmDialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)} pending={removing}
        title="Take this block off the calendar?"
        description={asking ? `${blockDays(asking)} · ${blockHours(asking)}${asking.note ? ` · ${asking.note}` : ""}. The time opens up for appointments again.` : null}
        confirm="Take it off" onConfirm={() => remove(asking.id)} />
      {projectId ? (
        <>
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setAdding(true)} data-block-out><Ban /> Block out time</Button>
          <BlockDialog open={adding} onOpenChange={setAdding} projectId={projectId} day={today}
            onDone={() => { setAdding(false); router.refresh(); }} />
        </>
      ) : <span className="shrink-0 text-xs text-muted-foreground">Choose a project to block out time.</span>}
    </div>
  );
}
