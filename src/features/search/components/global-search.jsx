"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Command } from "cmdk";
import {
  Search, Loader2, CornerDownLeft, Target, Users, FolderKanban, UserCog, FileText, Building2, X,
} from "lucide-react";
import { navGroups, rolesForPath } from "@/lib/nav";
import { useRole } from "@/components/layout/role-provider";
import { cn } from "@/lib/utils";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
// What can be searched, and a page each kind opens: a role sees only the kinds it can open.
const GROUPS = [
  ["leads", "Leads", Target, "/leads/1"],
  ["clients", "Clients", Users, "/clients/x"],
  ["projects", "Projects", FolderKanban, "/projects/1"],
  ["users", "Users", UserCog, "/users"],
  ["documents", "Documents", FileText, "/documents"],
  ["carriers", "Carriers", Building2, "/insurance-companies"],
];
const GROUP_ICONS = Object.fromEntries(GROUPS.map(([key, , icon]) => [key, icon]));
// The pages offered before anything is typed.
const JUMP_TO = 6;
// A group: its heading, then its results.
const GROUP = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 first:[&_[cmdk-group-heading]]:pt-1";

/** One result: chosen by the keys or the pointer (cmdk marks it data-selected), opened by Enter or a click. */
function Result({ item, onPick }) {
  const Icon = item.icon;
  return (
    <Command.Item
      value={item.key}
      onSelect={() => onPick(item)}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-foreground/90 transition-colors data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--panel-border)] text-muted-foreground transition-colors group-data-[selected=true]:border-primary/40 group-data-[selected=true]:text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        {item.subtitle ? <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}
      </span>
      <CornerDownLeft className="hidden size-3.5 shrink-0 text-muted-foreground group-data-[selected=true]:block" aria-hidden />
    </Command.Item>
  );
}

/**
 * The global search palette (cmdk). Opens from the topbar box or with Ctrl+K
 * (⌘K on a Mac), offers the pages the user can open, searches every record
 * type through /api/search as the user types, and lists matching pages too.
 * Arrow keys move, Enter opens, Esc closes.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const { role } = useRole();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modKey, setModKey] = useState("Ctrl");
  const inputRef = useRef(null);

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
  }, [open]);

  // Search as the user types, debounced, dropping responses that are stale
  // by the time they arrive. "Searching" from the first keystroke, so the
  // palette never says "No matches" before it has looked.
  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_CHARS) {
      setGroups([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
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

  // Pages whose name matches, limited to what this role can open (and only
  // once a search would run too, so nothing is listed while the hint shows).
  const pages = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < MIN_CHARS) return [];
    return navGroups
      .flatMap((g) => g.items)
      .filter((i) => i.roles.includes(role) && i.label.toLowerCase().includes(term))
      .slice(0, 4);
  }, [q, role]);

  // The results, a group each: matching pages first, then each kind of record.
  const sections = useMemo(
    () => [
      ...(pages.length
        ? [{ key: "pages", label: "Pages", items: pages.map((p) => ({ key: `page:${p.href}`, href: p.href, title: p.label, subtitle: "Go to page", icon: p.icon })) }]
        : []),
      ...groups.map((g) => ({
        key: g.key,
        label: g.label,
        count: g.total > g.items.length ? `${g.items.length} of ${g.total.toLocaleString()}` : String(g.total),
        items: g.items.map((i) => ({ key: `${g.key}:${i.id}`, href: i.href, title: i.title, subtitle: i.subtitle, icon: GROUP_ICONS[g.key] ?? Search })),
      })),
    ],
    [pages, groups]
  );
  const found = sections.reduce((n, g) => n + g.items.length, 0);
  const searchable = useMemo(() => GROUPS.filter(([, , , sample]) => rolesForPath(sample)?.includes(role)), [role]);
  // Before anything is typed: the pages this role opens most, to jump straight to.
  const jump = useMemo(
    () => navGroups.flatMap((g) => g.items).filter((i) => i.roles.includes(role)).slice(0, JUMP_TO)
      .map((p) => ({ key: `jump:${p.href}`, href: p.href, title: p.label, subtitle: "Go to page", icon: p.icon })),
    [role]
  );

  const go = (item) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  const term = q.trim();
  let status = null;
  if (error) status = error;
  else if (term.length < MIN_CHARS) status = "idle";
  else if (found === 0) status = loading ? "Searching…" : `No matches for “${term}”.`;

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

      {/* Drops in from above the field it opens from, and goes the same way (Motion). */}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <AnimatePresence>
        {open ? (
        <DialogPrimitive.Portal key="search" forceMount>
          <DialogPrimitive.Overlay forceMount asChild>
            <motion.div
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.18 } }}
              exit={{ opacity: 0, transition: { duration: 0.14 } }}
            />
          </DialogPrimitive.Overlay>
          <div className="pointer-events-none fixed inset-x-0 top-[10vh] z-50 flex justify-center px-4">
          <DialogPrimitive.Content
            forceMount
            asChild
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              inputRef.current?.focus();
            }}
          >
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.97, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 460, damping: 34 } }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12, ease: "easeIn" } }}
            className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-xl border bg-card text-card-foreground shadow-[0_24px_70px_-20px_rgb(0_0_0/0.6)] outline-none"
          >
            <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Search leads, clients, projects, users, documents and carriers, or jump to a page.
            </DialogPrimitive.Description>

            {/* cmdk: the palette's keyboard (↑↓, Home/End, Enter, Ctrl+N/P),
                the pointer choosing what it is over, and what a screen reader
                is told. The server finds the matches, so cmdk does not filter. */}
            <Command shouldFilter={false} loop label="Search everything" className="outline-none">
              {/* A real field, outlined and lit, so it reads as the place to type
                  rather than as the dialog's heading. */}
              <div className="border-b border-[var(--panel-border)] p-3">
                <label className="flex h-12 items-center gap-3 rounded-lg border-2 border-primary/45 bg-background px-3.5 ring-4 ring-primary/10 transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-primary/20">
                  <Search className="size-5 shrink-0 text-primary" />
                  <Command.Input
                    ref={inputRef}
                    value={q}
                    onValueChange={setQ}
                    onKeyDown={(e) => {
                      // Only what is on screen: never a page hidden behind a hint or an error.
                      if (e.key === "Enter" && status && status !== "idle") e.preventDefault();
                    }}
                    placeholder="Search a company, contact, phone or email…"
                    aria-label="Search everything"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-full w-full min-w-0 bg-transparent text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
                  />
                  {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-label="Searching" /> : null}
                  {q ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQ("");
                        inputRef.current?.focus();
                      }}
                      aria-label="Clear search"
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                  <kbd className="hidden shrink-0 rounded border border-[var(--panel-border)] bg-muted/50 px-1.5 py-0.5 font-sans text-[0.62rem] font-semibold text-muted-foreground sm:inline-block">
                    Esc
                  </kbd>
                </label>
              </div>

              <div id="global-search-results">
                <Command.List className="max-h-[60vh] overflow-y-auto scroll-py-2 p-2">
                  {status === "idle" ? (
                    <>
                      {/* Before anything is typed: say what can be found, and offer the way there. */}
                      <div className="px-3 pb-2 pt-4 text-center">
                        <p className="text-sm text-muted-foreground">Type at least two letters to search across</p>
                        <div className="mt-3 flex flex-wrap justify-center gap-2">
                          {searchable.map(([key, label, Icon]) => (
                            <span key={key} data-search-kind={key} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--panel-border)] bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                              <Icon className="size-3.5 text-primary" /> {label}
                            </span>
                          ))}
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">Every word counts: “sean fitzgerald”, “drain llc”, or a phone number however it is written.</p>
                      </div>
                      {jump.length ? (
                        <Command.Group heading={<span data-jump-group className="eyebrow">Jump to</span>} className={GROUP}>
                          {jump.map((item) => <Result key={item.key} item={item} onPick={go} />)}
                        </Command.Group>
                      ) : null}
                    </>
                  ) : status ? (
                    <p className="px-3 py-8 text-center text-sm text-muted-foreground" aria-live="polite">{status}</p>
                  ) : (
                    sections.map((g) => (
                      <Command.Group
                        key={g.key}
                        className={GROUP}
                        heading={
                          <span data-search-group={g.key} className="flex items-baseline justify-between">
                            <span className="eyebrow">{g.label}</span>
                            {g.count ? <span className="text-[0.66rem] tabular-nums text-muted-foreground" data-group-count>{g.count}</span> : null}
                          </span>
                        }
                      >
                        {g.items.map((item) => <Result key={item.key} item={item} onPick={go} />)}
                      </Command.Group>
                    ))
                  )}
                </Command.List>
              </div>
            </Command>

            <div className="flex items-center gap-4 border-t border-[var(--panel-border)] px-4 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <span><kbd className="font-sans">↑↓</kbd> navigate</span>
              <span><kbd className="font-sans">↵</kbd> open</span>
              <span><kbd className="font-sans">esc</kbd> close</span>
            </div>
          </motion.div>
          </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
        ) : null}
        </AnimatePresence>
      </DialogPrimitive.Root>
    </>
  );
}
