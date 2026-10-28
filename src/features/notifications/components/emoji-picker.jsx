"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EMOJI_GROUPS, findEmoji } from "@/lib/emoji";
import { cn } from "@/lib/utils";

const RECENT_KEY = "lighthouse.emoji.recent";

function readRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => typeof e === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}

/**
 * An emoji to put in a message or on one (Oct 2026): found by a word, or
 * from its group; the ones used lately first (kept in this browser).
 * `children` is the button that opens it.
 */
export default function EmojiPicker({ onPick, children, align = "start", side = "top", label = "Emoji" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState([]);
  const found = useMemo(() => findEmoji(q), [q]);

  const pick = (e) => {
    onPick(e);
    const next = [e, ...readRecent().filter((x) => x !== e)].slice(0, 16);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Not kept in this browser; the pick still went in.
    }
    setOpen(false);
  };
  const cell = (e, title) => (
    <button key={e} type="button" title={title} onClick={() => pick(e)} data-emoji={e}
      className="flex size-8 items-center justify-center rounded-md text-xl leading-none transition-colors hover:bg-muted">{e}</button>
  );

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setRecent(readRecent()); else setQ(""); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[19rem] max-w-[calc(100vw-2rem)] bg-card p-0" aria-label={label} data-emoji-picker>
        <div className="flex items-center gap-2 border-b border-[var(--panel-border)] px-2.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an emoji…" aria-label="Find an emoji"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" data-emoji-find />
        </div>
        <div className="max-h-72 overflow-y-auto overscroll-contain p-2" onWheel={(e) => e.stopPropagation()}>
          {q.trim() ? (
            found.length ? <div className="grid grid-cols-8 gap-0.5">{found.map((x) => cell(x.e, x.w))}</div>
              : <p className="py-4 text-center text-xs text-muted-foreground">No emoji for “{q.trim()}”.</p>
          ) : (
            <>
              {recent.length ? (
                <section className="mb-2">
                  <h4 className="eyebrow px-1 pb-1">Recent</h4>
                  <div className="grid grid-cols-8 gap-0.5">{recent.map((e) => cell(e, "Recent"))}</div>
                </section>
              ) : null}
              {EMOJI_GROUPS.map((grp) => (
                <section key={grp.name} className={cn("mb-2 last:mb-0")}>
                  <h4 className="eyebrow px-1 pb-1">{grp.name}</h4>
                  <div className="grid grid-cols-8 gap-0.5">{grp.emoji.map((x) => cell(x.e, x.w))}</div>
                </section>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
