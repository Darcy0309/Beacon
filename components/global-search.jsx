"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Search, Loader2, CornerDownLeft, Target, Users, FolderKanban, UserCog, FileText, Building2,
} from "lucide-react";
import { navGroups } from "@/lib/nav";
import { useRole } from "@/components/role-provider";
import { cn } from "@/lib/utils";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
const GROUP_ICONS = { leads: Target, clients: Users, projects: FolderKanban, users: UserCog, documents: FileText, carriers: Building2 };

/**
 * The global search palette. Opens from the topbar box or with Ctrl+K (⌘K on
 * a Mac), searches every record type through /api/search as the user types,
 * and lists pages the user can navigate to. Arrow keys move, Enter opens,
 * Esc closes.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const { role } = useRole();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [modKey, setModKey] = useState("Ctrl");
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // The shortcut hint depends on the platform; decided after hydration so
  // the server and client render the same markup.
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setModKey("⌘");
  }, []);

  // Ctrl+K / ⌘K anywhere on the page toggles the palette.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Start clean every time it opens.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setGroups([]);
    setError("");
    setActive(0);
  }, [open]);

  // Search as the user types, debounced, dropping responses that are stale
  // by the time they arrive.
  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_CHARS) {
      setGroups([]);
      setLoading(false);
      setError("");
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const json = await res.json();
        setGroups(json.groups ?? []);
        setError(json.error ?? "");
      } catch (err) {
        if (err.name !== "AbortError") setError("Search failed. Try again.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  // Pages whose name matches, limited to what this role can open.
  const pages = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return navGroups
      .flatMap((g) => g.items)
      .filter((i) => i.roles.includes(role) && i.label.toLowerCase().includes(term))
      .slice(0, 4);
  }, [q, role]);

  // One flat list drives keyboard navigation; group headings are inserted
  // where the group changes.
  const flat = useMemo(
    () => [
      ...pages.map((p) => ({ key: `page:${p.href}`, href: p.href, title: p.label, subtitle: "Go to page", icon: p.icon, group: "Pages" })),
      ...groups.flatMap((g) =>
        g.items.map((i) => ({ key: `${g.key}:${i.id}`, href: i.href, title: i.title, subtitle: i.subtitle, icon: GROUP_ICONS[g.key] ?? Search, group: g.label }))
      ),
    ],
    [pages, groups]
  );

  useEffect(() => setActive(0), [flat]);
  useEffect(() => {
    listRef.current?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active]);
    }
  };

  const term = q.trim();
  let status = null;
  if (error) status = error;
  else if (term.length < MIN_CHARS) status = "Search leads, clients, projects, users, documents and carriers.";
  else if (flat.length === 0) status = loading ? "Searching…" : `No matches for “${term}”.`;

  return (
    <>
      {/* The topbar box: looks like a field, acts as the opener. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search (Ctrl+K)"
        className="hidden h-9 w-44 items-center gap-2 rounded-md border border-input bg-background/60 px-2.5 text-sm text-muted-foreground transition-[width,color,border-color] duration-300 ease-out hover:w-64 hover:border-primary/40 hover:text-foreground sm:flex"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search…</span>
        <kbd className="hidden rounded border border-[var(--panel-border)] bg-muted/50 px-1.5 py-0.5 font-sans text-[0.62rem] font-semibold text-muted-foreground md:inline-block">
          {modKey} K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex size-9 items-center justify-center rounded-md border border-[var(--panel-border)] bg-card/80 text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:text-primary active:scale-95 sm:hidden"
      >
        <Search className="size-4" />
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              inputRef.current?.focus();
            }}
            className="fixed left-1/2 top-[10vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl outline-none"
          >
            <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Search leads, clients, projects, users, documents and carriers, or jump to a page.
            </DialogPrimitive.Description>

            <div className="flex items-center gap-3 border-b border-[var(--panel-border)] px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search everything…"
                aria-label="Search everything"
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls="global-search-results"
                aria-activedescendant={flat[active] ? `gs-${flat[active].key}` : undefined}
                autoComplete="off"
                spellCheck={false}
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-label="Searching" /> : null}
              <kbd className="hidden shrink-0 rounded border border-[var(--panel-border)] bg-muted/50 px-1.5 py-0.5 font-sans text-[0.62rem] font-semibold text-muted-foreground sm:inline-block">
                Esc
              </kbd>
            </div>

            <div id="global-search-results" ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
              {status ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground" aria-live="polite">{status}</p>
              ) : (
                flat.map((item, i) => {
                  const Icon = item.icon;
                  const heading = i === 0 || flat[i - 1].group !== item.group;
                  const isActive = i === active;
                  return (
                    <div key={item.key}>
                      {heading ? <div className="eyebrow px-3 pb-1 pt-3 first:pt-1">{item.group}</div> : null}
                      <button
                        type="button"
                        id={`gs-${item.key}`}
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive ? "true" : undefined}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(item)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                          isActive ? "bg-primary/10 text-foreground" : "text-foreground/90 hover:bg-muted/60"
                        )}
                      >
                        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border", isActive ? "border-primary/40 text-primary" : "border-[var(--panel-border)] text-muted-foreground")}>
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.title}</span>
                          {item.subtitle ? <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}
                        </span>
                        {isActive ? <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-[var(--panel-border)] px-4 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <span><kbd className="font-sans">↑↓</kbd> navigate</span>
              <span><kbd className="font-sans">↵</kbd> open</span>
              <span><kbd className="font-sans">esc</kbd> close</span>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
