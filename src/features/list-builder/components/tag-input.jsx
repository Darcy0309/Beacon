"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Words kept as tags (List Builder, Oct 2026): typing a comma, or Enter,
 * turns what was typed into a tag; leaving the box does too; Backspace in an
 * empty box takes the last one off; a pasted list comes in as one tag each
 * (split by commas, lines or semicolons).
 *
 *   value      the tags
 *   normalize  (text) => the tag, or null for one that is not taken (a ZIP that is not five digits)
 */
export default function TagInput({ value, onChange, placeholder, normalize = (t) => t, label, ...rest }) {
  const [text, setText] = useState("");

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

  const onText = (v) => {
    if (/[,\n;]/.test(v)) {
      // Everything up to the last separator becomes tags; what follows it stays being typed.
      const at = Math.max(v.lastIndexOf(","), v.lastIndexOf("\n"), v.lastIndexOf(";"));
      const done = v.slice(0, at);
      const pending = v.slice(at + 1);
      add(split(done));
      setText(pending.trimStart());
    } else setText(v);
  };

  return (
    <div className="flex flex-col gap-1.5" data-tag-input={rest["data-tag-input"] ?? label}>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background/60 px-2 py-1.5 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring/30">
        {value.map((v) => (
          // A pill, as the states are.
          <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--panel-border)] bg-card py-1 pl-3 pr-1.5 text-xs font-semibold text-foreground/80" data-tag={v}>
            <span className="truncate">{v}</span>
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"><X className="size-3" /></button>
          </span>
        ))}
        <input value={text} placeholder={value.length ? "" : placeholder} aria-label={label}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(split(text)); setText(""); }
            else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => { if (text.trim()) { add(split(text)); setText(""); } }}
          className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none" data-tag-text />
      </div>
    </div>
  );
}
