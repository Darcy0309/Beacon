"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { imageUrl, initialsOf } from "@/lib/images";
import { ROLES } from "@/lib/nav";

/**
 * The team as cards: photo (or initials), name, what they do, and their line
 * about themselves. A name to look for narrows them; "With a photo" shows
 * only those who have one (as the old Meet DCM did).
 */
export default function TeamGrid({ groups }) {
  const [q, setQ] = useState("");
  const [photos, setPhotos] = useState(false);
  const match = (m) => (!q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase())) && (!photos || m.photo);
  const shown = groups.map((g) => ({ ...g, people: g.people.filter(match) }));
  const none = shown.every((g) => g.people.length === 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone by name…" className="pl-8" aria-label="Find someone by name" data-team-search />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} className="size-4 accent-[var(--primary)]" data-team-photos />
          With a photo
        </label>
      </div>
      {shown.map((g) => (g.people.length ? (
        <section key={g.key} data-team-group={g.key}>
          {g.label ? <h3 className="mb-2 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{g.label}</h3> : null}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.people.map((m) => (
              <li key={m.id} data-team-member={m.id} className="flex items-start gap-3 rounded-xl border border-[var(--panel-border)] bg-card p-4">
                <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/12 text-lg font-bold text-primary">
                  {m.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(m.photo)} alt={m.name} className="size-full object-cover" loading="lazy" />
                  ) : initialsOf(m.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{m.name}</span>
                  <span className="block text-xs text-muted-foreground">{ROLES[m.role]?.label ?? "Team"}</span>
                  {m.bio ? <span className="mt-1.5 block text-sm leading-snug text-muted-foreground">{m.bio}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null))}
      {none ? <p className="py-10 text-center text-sm text-muted-foreground">Nobody matches that.</p> : null}
    </div>
  );
}
