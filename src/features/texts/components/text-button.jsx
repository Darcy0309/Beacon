"use client";

import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

// Told to the lead's Conversation: { digits }, the number to text.
export const LEAD_TEXT_EVENT = "lighthouse:text-lead";

/**
 * Text a number (client, Nov 2026): beside each Call button on the lead sheet. Opens the history's
 * Conversation tab, picks this number in its "Text to", and puts the cursor in the message box.
 */
export default function TextButton({ digits, label, className }) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Text"
      data-text-number={digits}
      onClick={() => {
        document.querySelector('[role="tab"][data-tab="conversation"]')?.click();
        window.dispatchEvent(new CustomEvent(LEAD_TEXT_EVENT, { detail: { digits } }));
      }}
      className={cn(
        "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-sky-500 text-white shadow-[0_0_14px_-6px_var(--neon-cyan)] transition-all hover:brightness-110 active:scale-95",
        className
      )}
    >
      <MessageSquare className="size-4" />
    </button>
  );
}
