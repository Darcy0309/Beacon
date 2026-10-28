"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchGifs } from "@/features/notifications/actions";
import { reach } from "@/lib/reach";

/**
 * A GIF to send (Oct 2026), from GIPHY: what is trending, or what a word
 * finds, a moment after typing stops. GIPHY asks to be credited.
 * `children` is the button that opens it.
 */
export default function GifPicker({ onPick, children }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState(null);
  const [error, setError] = useState("");
  const asked = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    const n = ++asked.current;
    setError("");
    const t = setTimeout(async () => {
      const r = await reach(() => searchGifs(q));
      if (n !== asked.current) return;
      if (r.ok) setGifs(r.data.gifs);
      else { setGifs([]); setError(r.error); }
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQ(""); setGifs(null); } }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col bg-card p-0" aria-label="GIFs" data-gif-picker>
        <div className="flex items-center gap-2 border-b border-[var(--panel-border)] px-2.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search GIPHY…" aria-label="Search GIFs"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" data-gif-find />
        </div>
        <div className="max-h-80 min-h-32 overflow-y-auto overscroll-contain p-2" onWheel={(e) => e.stopPropagation()}>
          {gifs === null ? (
            <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading GIFs…</p>
          ) : error ? (
            <p className="py-8 text-center text-xs text-muted-foreground" data-gif-error>{error}</p>
          ) : gifs.length ? (
            <div className="columns-2 gap-1.5 [&>*]:mb-1.5">
              {gifs.map((g) => (
                <button key={g.id} type="button" onClick={() => { onPick(g); setOpen(false); }} title={g.title}
                  className="block w-full overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-85" data-gif={g.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.preview} alt={g.title || "GIF"} loading="lazy" width={g.width} height={g.height} className="block h-auto w-full" />
                </button>
              ))}
            </div>
          ) : <p className="py-8 text-center text-xs text-muted-foreground">No GIFs for “{q.trim()}”.</p>}
        </div>
        <p className="border-t border-[var(--panel-border)] px-3 py-1.5 text-right text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Powered by GIPHY</p>
      </PopoverContent>
    </Popover>
  );
}
