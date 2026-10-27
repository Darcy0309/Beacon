"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Words kept as tags (List Builder, Oct 2026): typing a comma, or Enter,
 * turns what was typed into a tag; leaving the box does too; Backspace in an
 * empty box takes the last one off; a pasted list comes in as one tag each
 * (split by commas, lines or semicolons). With `suggest`, names to pick come
 * up as one types (the Census's counties or cities: "Maricopa County, AZ"):
 * a click, or the arrows and Enter, takes one whole.
 *
 *   value      the tags
 *   normalize  (text) => the tag, or null for one that is not taken (a ZIP that is not five digits)
 *   suggest    async (text) => [names] to offer
 */
export default function TagInput({ value, onChange, placeholder, normalize = (t) => t, suggest = null, label, ...rest }) {
  const [text, setTextState] = useState("");
  const textRef = useRef("");
  const setText = (t) => { textRef.current = t; setTextState(t); };
  const [offers, setOffers] = useState([]);
  const [active, setActive] = useState(-1);
  const asked = useRef(0);

  const add = (pieces) => {
    const next = [...value];
    const seen = new Set(next.map((v) => v.toLowerCase()));
    for (const raw of pieces) {
      const t = raw.replace(/\s+/g, " ").trim();
      if (!t) continue;
      const tag = normalize(t);
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        next.push(tag);
      }
    }
    if (next.length !== value.length) onChange(next);
  };
  // What a paste or a typed comma holds: a tag between each comma, line or semicolon.
  const split = (s) => s.split(/[,\n;]/);
  const take = (name) => {
    add([name]);
    setText("");
    setOffers([]);
    setActive(-1);
  };

  // Names to offer for what is being typed, a moment after typing stops.
  useEffect(() => {
    if (!suggest) return undefined;
    const q = text.trim();
    if (q.length < 2) { setOffers([]); return undefined; }
    const n = ++asked.current;
    const t = setTimeout(async () => {
      try {
        const found = await suggest(q);
        if (n === asked.current) {
          const have = new Set(value.map((v) => v.toLowerCase()));
          setOffers((found ?? []).filter((f) => !have.has(f.toLowerCase())));
          setActive(-1);
        }
      } catch {
        // No suggestions this time; typing still works.
      }
    }, 180);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const onText = (v) => {
    if (/[,\n;]/.test(v)) {
      // Everything up to the last separator becomes tags; what follows it stays being typed.
      const at = Math.max(v.lastIndexOf(","), v.lastIndexOf("\n"), v.lastIndexOf(";"));
      add(split(v.slice(0, at)));
      setText(v.slice(at + 1).trimStart());
    } else setText(v);
  };

  return (
    <div className="relative flex flex-col gap-1.5" data-tag-input={rest["data-tag-input"] ?? label}>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background/60 px-2 py-1.5 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring/30">
        {value.map((v) => (
          // A pill, as the states are.
          <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--panel-border)] bg-card py-1 pl-3 pr-1.5 text-xs font-semibold text-foreground/80" data-tag={v}>
            <span className="truncate">{v}</span>
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"><X className="size-3" /></button>
          </span>
        ))}
        <input value={text} placeholder={value.length ? "" : placeholder} aria-label={label} autoComplete="off"
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (offers.length && e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(offers.length - 1, i + 1)); }
            else if (offers.length && e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(-1, i - 1)); }
            else if (e.key === "Escape") setOffers([]);
            else if (e.key === "Enter") {
              e.preventDefault();
              if (active >= 0 && offers[active]) take(offers[active]);
              else { add(split(text)); setText(""); setOffers([]); }
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => {
            // A moment, so a click on a suggestion lands first.
            setTimeout(() => {
              setOffers([]);
              const t = textRef.current;
              if (t.trim()) { add(split(t)); setText(""); }
            }, 150);
          }}
          className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none" data-tag-text />
      </div>
      {offers.length ? (
        <ul role="listbox" aria-label={`${label}: suggestions`} className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg" data-tag-offers>
          {offers.map((o, i) => (
            <li key={o}>
              <button type="button" role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => take(o)}
                className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm", i === active ? "bg-muted" : "hover:bg-muted/60")} data-tag-offer={o}>
                {o}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
