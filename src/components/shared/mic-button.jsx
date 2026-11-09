"use client";

import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The button to talk to type (use-dictation.js): a microphone, red and pulsing while it listens, a
 * press again to stop. Pressing it never takes the cursor from the field it types into.
 */
export default function MicButton({ listening, onToggle, className }) {
  return (
    <button
      type="button"
      // The field keeps the cursor (and a notes box its new line): pressed, not focused.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      aria-pressed={listening}
      aria-label={listening ? "Stop talking to type" : "Talk to type"}
      title={listening ? "Listening… press to stop" : "Talk to type: press, then speak"}
      data-dictation={listening ? "on" : "off"}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
        listening ? "bg-rose-500 text-white shadow-[0_0_0_4px_rgb(244_63_94/0.2)] animate-pulse" : "text-muted-foreground hover:bg-muted hover:text-primary",
        className
      )}
    >
      {listening ? <Square className="size-3 fill-current" /> : <Mic className="size-4" />}
    </button>
  );
}
