"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { blockDays, blockHours } from "@/lib/project-calendar";
import { cn } from "@/lib/utils";
import { BlockDialog } from "@/features/calendar/components/project-calendar";
import RemoveBlock from "@/features/calendar/components/remove-block";

/**
 * A project calendar's blocked time, in a line: each block still to come
 * (its days, its hours, its note) with a way to take it off, and Block out
 * time. For the Calendar page's toolbar, where the month below shades the
 * same days. The client's days to avoid (every week, from Project Info) show
 * here too, and are changed there. `blocks`: getProjectCalendar()'s, from today on. `children`:
 * more for the line (Sync my calendar). Without a `projectId` it is several
 * calendars together (a client's): each block names its project, and one is
 * chosen to add more. Every block can be taken off, the first few here and
 * the rest under "+ more" (Sean, Oct 2026: a day blocked by mistake).
 */
export default function BlockedTime({ projectId = null, blocks: every, today, children }) {
  // Blocked out by hand, each named; busy times from connected calendars, counted.
  const blocks = every.filter((b) => !b.synced);
  const synced = every.length - blocks.length;
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2" data-blocked-time>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
      {(all ? blocks : blocks.slice(0, 4)).map((b) => (
        <span key={b.id} data-block={b.id} title={[b.project, b.note, b.by ? `by ${b.by}` : null].filter(Boolean).join(" · ") || undefined}
          className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", projectId ? "max-w-56" : "max-w-80")}
          style={{ borderColor: "color-mix(in srgb, var(--neon-amber) 45%, transparent)", background: "color-mix(in srgb, var(--neon-amber) 8%, transparent)" }}>
          <Ban className="size-3 shrink-0" style={{ color: "var(--neon-amber)" }} />
          <span className="truncate">{blockDays(b)} · {blockHours(b)}{b.note ? ` · ${b.note}` : ""}{b.project ? ` · ${b.project}` : ""}</span>
          {/* The client's days to avoid change with their Project Info, not here. */}
          <RemoveBlock block={b} size="size-3" className="rounded-full" />
        </span>
      ))}
      {blocks.length > 4 ? (
        <button type="button" onClick={() => setAll((x) => !x)} className="text-xs font-semibold text-primary hover:underline" data-blocks-more>
          {all ? "Show fewer" : `+${blocks.length - 4} more`}
        </button>
      ) : null}
      {synced ? <span className="text-xs text-muted-foreground" data-synced-count>{synced} busy time{synced === 1 ? "" : "s"} from synced calendars</span> : null}
      {every.length === 0 ? <span className="text-xs text-muted-foreground">No time blocked out.</span> : null}
      </div>
      {children}
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
