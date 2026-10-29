"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { removeCalendarBlock } from "@/features/calendar/actions";
import { blockDays, blockHours } from "@/lib/project-calendar";
import { reach } from "@/lib/reach";
import { cn } from "@/lib/utils";

/**
 * Take blocked time off the calendar, wherever it shows (Sean, Oct 2026: a
 * day blocked out by mistake had to be undone): asks first, saying what comes
 * off (every week of one that repeats). None for busy time from a connected
 * calendar (it goes with that calendar) or the client's days to avoid (changed
 * in Project Info).
 */
export default function RemoveBlock({ block: b, className, size = "size-3.5" }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (!b || b.synced || b.weekly || typeof b.id !== "number") return null;
  const remove = () =>
    start(async () => {
      const f = new FormData();
      f.set("id", String(b.id));
      const result = await reach(() => removeCalendarBlock(f));
      if (result.ok) {
        toast.success("Taken off the calendar");
        setAsking(false);
        router.refresh();
      } else toast.error(result.error);
    });
  // Kept from what is under it (a day's column takes a drag to add a note): its dialog's presses too, which React passes up through it.
  return (
    <span className="contents" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setAsking(true); }} disabled={pending}
        aria-label={`Take the block on ${blockDays(b)} off the calendar`} title="Take it off the calendar" data-remove-block
        className={cn("shrink-0 rounded text-muted-foreground transition-colors hover:text-destructive", className)}>
        <X className={size} />
      </button>
      <ConfirmDialog open={asking} onOpenChange={setAsking} pending={pending}
        title="Take this block off the calendar?"
        description={`${blockDays(b)} · ${blockHours(b)}${b.note ? ` · ${b.note}` : ""}. ${b.weekdays ? "Every week of it comes off. " : ""}The time opens up for appointments again.`}
        confirm="Take it off" onConfirm={remove} />
    </span>
  );
}
