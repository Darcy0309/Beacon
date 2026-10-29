"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "@/components/shared/intent-link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { matchesAll, searchWords } from "@/lib/search-words";
import { csvLine } from "@/lib/lead-export";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PAGE_SIZE, PAGE_SIZES } from "@/lib/paging";
import { useReportPending } from "@/components/layout/navigation-progress";

/**
 * A data table with a search box and facet filters across the top.
 *
 * Pages stay server components: each row arrives already rendered as `node`
 * (a <TableRow>) next to the plain strings the filter needs.
 *
 *   <FilterTable
 *     columns={["Project", "Client", { label: "Action", className: "text-right" }]}
 *     filters={[{ key: "status", label: "Status" }, { key: "client", label: "Client", kind: "select" }]}
 *     rows={projects.map((p) => ({
 *       id: p.id,
 *       search: `${p.name} ${p.client}`,
 *       facets: { status: p.status, client: p.client },
 *       node: <TableRow>…</TableRow>,
 *     }))}
 *   />
 *
 * Two modes:
 *
 * - Client (default): every row is on hand. Search and facets filter here,
 *   and facet options with counts are derived from the rows.
 * - Server: pass `paging` (from pageInfo), the current `query` and
 *   `selected` facets. The rows are one page, already filtered by the
 *   database; the search box and chips write ?q=, ?<facet>= and ?page= to
 *   the URL and the server re-renders. Each filter supplies its own
 *   `options` ([{ value, label, count? }]) because the page cannot know
 *   what the other pages hold.
 *
 * A facet with up to CHIP_LIMIT options renders as a chip row, larger ones
 * fall back to a select; set `kind: "chips" | "select"` to force one, or
 * "multi" for a drop-down of checkboxes where several can be picked (kept as
 * "a,b,c" in its URL parameter in server mode; filtered here otherwise; an
 * option's `group` heads its part of the list).
 * `searchable={false}` drops the search box, for a list that cannot be searched.
 * `exportCsv` ({ name, header }, client mode): an Export CSV button saving
 * the rows as filtered just then, each row's `csv` cells under `header`.
 * `urlFacets` (client mode): facets also kept in the URL, for a page whose
 * other parts follow them; their starting values come in `selected`.
 */
const CHIP_LIMIT = 6;
// Between the values picked in a "multi" filter on a list filtered here (names may hold commas).
const MULTI_SEP = "\u001f";
const SEARCH_DEBOUNCE_MS = 300;

export default function FilterTable({
  columns,
  rows,
  filters = [],
  placeholder = "Search…",
  empty = "Nothing here yet.",
  className,
  query = "",
  selected,
  paging,
  searchable = true,
  exportCsv = null,
  urlFacets = [],
}) {
  const server = Boolean(paging);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  useReportPending(isPending); // the bar along the top runs while the list is on its way

  const [q, setQ] = useState(query);
  const [picked, setPicked] = useState(selected ?? {});

  // Server mode keeps the URL as the source of truth. When it changes from
  // outside (back button, a link) adopt it; when it changes because of what
  // the user just typed, leave the input alone so keystrokes are not undone
  // by a response that is already stale.
  const pushed = useRef(JSON.stringify({ q: query, picked: selected ?? {} }));
  useEffect(() => {
    if (!server) return;
    const incoming = JSON.stringify({ q: query, picked: selected ?? {} });
    if (incoming !== pushed.current) {
      pushed.current = incoming;
      setQ(query);
      setPicked(selected ?? {});
    }
  }, [server, query, selected]);

  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const navigate = (nextQ, nextPicked) => {
    pushed.current = JSON.stringify({ q: nextQ, picked: nextPicked });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (nextQ) params.set("q", nextQ);
    else params.delete("q");
    for (const f of filters) {
      if (nextPicked[f.key]) params.set(f.key, nextPicked[f.key]);
      else params.delete(f.key);
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // Rows per page lives in ?per=; changing it starts again from page 1.
  const setPerPage = (per) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (Number(per) === PAGE_SIZE) params.delete("per");
    else params.set("per", String(per));
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const onQuery = (value) => {
    setQ(value);
    if (!server) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(value.trim(), picked), SEARCH_DEBOUNCE_MS);
  };
  // A facet filtered here that the page also reads (`urlFacets`): kept in its URL parameter too, so the
  // server draws what depends on it (Oct 2026: the Clients tiles follow the Sales Rep picked).
  const writeUrlFacets = (next) => {
    if (!urlFacets.length) return;
    const params = new URLSearchParams(searchParams.toString());
    for (const key of urlFacets) {
      if (next[key]) params.set(key, next[key]);
      else params.delete(key);
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const onPick = (key, value) => {
    const next = { ...picked, [key]: value };
    setPicked(next);
    if (!server && urlFacets.includes(key)) writeUrlFacets(next);
    if (!server) return;
    clearTimeout(timer.current);
    navigate(q.trim(), next);
  };
  const reset = () => {
    setQ("");
    setPicked({});
    if (!server && urlFacets.some((key) => picked[key])) writeUrlFacets({});
    if (!server) return;
    clearTimeout(timer.current);
    navigate("", {});
  };

  // Facet options: supplied by the page in server mode; otherwise the
  // distinct values across the rows, most common first, counted over every
  // row so the chips hold still while the user narrows the table.
  const groups = useMemo(
    () =>
      filters.map((f) => {
        let options = f.options;
        if (!options) {
          const counts = new Map();
          for (const r of rows) {
            const v = r.facets?.[f.key];
            if (v == null || v === "") continue;
            counts.set(String(v), (counts.get(String(v)) || 0) + 1);
          }
          options = [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([value, count]) => ({ value, label: value, count }));
        }
        const kind = f.kind ?? (options.length > CHIP_LIMIT ? "select" : "chips");
        return { ...f, options, kind, ...(kind === "multi" && !server ? { sep: MULTI_SEP } : {}) };
      }),
    [filters, rows, server]
  );

  // The same word rules as every server-side search: each word, in any order.
  const terms = searchWords(q);
  const shown = server
    ? rows
    : rows.filter((r) => {
        for (const f of filters) {
          const want = picked[f.key];
          if (!want) continue;
          const value = String(r.facets?.[f.key] ?? "");
          // Several at once (a "multi" filter): any of those picked.
          if (f.kind === "multi" ? !want.split(MULTI_SEP).includes(value) : value !== want) return false;
        }
        return terms.length === 0 || matchesAll(r.search, terms);
      });

  const active = terms.length > 0 || Object.values(picked).some(Boolean);
  // The rows as filtered now, saved as a CSV (a byte-order mark first, so Excel reads it as UTF-8).
  const download = () => {
    const text = [exportCsv.header, ...shown.map((r) => r.csv ?? [])].map(csvLine).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${text}\r\n`], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: exportCsv.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const heads = columns.map((c) => (typeof c === "string" ? { label: c } : c));

  let summary;
  if (server) summary = paging.total ? `${paging.from}–${paging.to} of ${paging.total}` : "0 results";
  else summary = active ? `${shown.length} of ${rows.length}` : `${rows.length} total`;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--panel-border)] px-5 py-3">
        {searchable ? (
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              className="h-8 pl-8 pr-8"
            />
            {isPending ? (
              <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" aria-label="Loading" />
            ) : null}
          </div>
        ) : null}

        {groups.map((g) => (
          <FacetGroup key={g.key} group={g} value={picked[g.key] ?? ""} onChange={(v) => onPick(g.key, v)} />
        ))}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums" aria-live="polite">{summary}</span>
          {exportCsv && !server ? (
            <button type="button" onClick={download} disabled={shown.length === 0} data-export-csv
              title={`The ${shown.length.toLocaleString()} row${shown.length === 1 ? "" : "s"} shown, as a CSV`}
              className="flex items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.12em] transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40">
              <Download className="size-3.5" /> Export CSV
            </button>
          ) : null}
          {active ? (
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1 font-semibold uppercase tracking-[0.1em] text-[0.66rem] text-primary transition-opacity hover:opacity-75"
            >
              <X className="size-3" /> Clear
            </button>
          ) : null}
        </div>
      </div>

      <Table className={cn("transition-opacity", isPending && "opacity-60")}>
        <TableHeader>
          <TableRow>
            {heads.map((h, i) => (
              <TableHead key={i} className={h.className}>{h.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <Fragment key={r.id}>{r.node}</Fragment>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={heads.length} className="py-10 text-center text-muted-foreground">
                {active ? "Nothing matches your filters." : empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {server && (paging.pages > 1 || paging.total > PAGE_SIZES[0]) ? (
        <Pager paging={paging} searchParams={searchParams} pathname={pathname} onPerPage={setPerPage} />
      ) : null}
    </div>
  );
}

function FacetGroup({ group, value, onChange }) {
  if (group.options.length === 0) return null;

  if (group.kind === "multi") return <MultiFacet group={group} value={value} onChange={onChange} />;

  if (group.kind === "select") {
    return (
      <label className="flex items-center gap-2">
        <span className="eyebrow">{group.label}</span>
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Filter by ${group.label}`}
          className="h-8 w-auto min-w-36 text-xs"
        >
          <option value="">All</option>
          {group.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}{o.count != null ? ` (${o.count})` : ""}
            </option>
          ))}
        </Select>
      </label>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Filter by ${group.label}`}>
      <span className="eyebrow mr-0.5">{group.label}</span>
      <Chip active={value === ""} onClick={() => onChange("")}>All</Chip>
      {group.options.map((o) => (
        <Chip key={o.value} active={value === o.value} onClick={() => onChange(value === o.value ? "" : o.value)}>
          {o.label}
          {o.count != null ? <span className="ml-1.5 tabular-nums opacity-60">{o.count}</span> : null}
        </Chip>
      ))}
    </div>
  );
}

/**
 * Several options at once (Sean, Oct 2026: the call results a lead list
 * shows): a button saying what is picked, opening a list of checkboxes, each
 * group under its heading. Picked values go out as "a,b,c" (in the URL, server
 * mode), or joined by MULTI_SEP in a list filtered here, whose values are names
 * that may hold a comma. The list floats over the page (a card never cuts it
 * off); a long one has a box on top to find an option by typing. Closes on a
 * click outside or Escape.
 */
const FIND_FROM = 13;
function MultiFacet({ group, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const sep = group.sep ?? ",";
  const picked = useMemo(() => new Set(String(value || "").split(sep).filter(Boolean)), [value, sep]);
  // In the list's own order, so the address reads the same however they were ticked.
  const set = (next) => onChange(group.options.filter((o) => next.has(String(o.value))).map((o) => o.value).join(sep));
  const toggle = (v) => {
    const next = new Set(picked);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    set(next);
  };
  const summary = picked.size === 0 ? "All"
    : picked.size === 1 ? group.options.find((o) => picked.has(String(o.value)))?.label ?? "1 selected"
    : `${picked.size} selected`;
  const long = group.options.length >= FIND_FROM;
  const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? group.options.filter((o) => words.every((w) => `${o.label} ${o.group ?? ""}`.toLowerCase().includes(w))) : group.options;

  return (
    <div className="flex items-center gap-2" data-multi-facet={group.key}>
      <span className="eyebrow">{group.label}</span>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFind(""); }}>
        <PopoverTrigger asChild>
          <button type="button" aria-haspopup="listbox" aria-label={`Filter by ${group.label}: ${summary}`}
            className={cn("flex h-8 min-w-36 max-w-64 items-center gap-2 rounded-md border px-2.5 text-xs transition-colors",
              picked.size ? "border-primary/50 bg-primary/10 text-primary" : "border-input bg-background/60 hover:border-primary/40")}>
            <span className="flex-1 truncate text-left">{summary}</span>
            <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden bg-card p-0" data-multi-facet-list={group.key}>
          {long ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--panel-border)] px-2.5">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Find a ${group.label.toLowerCase()}…`}
                aria-label={`Find a ${group.label.toLowerCase()}`} className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none" data-multi-facet-find />
            </div>
          ) : null}
          <div role="listbox" aria-multiselectable aria-label={group.label} className="max-h-80 min-h-0 overflow-y-auto overscroll-contain p-1" onWheel={(e) => e.stopPropagation()}>
            {shown.map((o, i) => {
              const on = picked.has(String(o.value));
              const heading = o.group && o.group !== shown[i - 1]?.group ? o.group : null;
              return (
                <Fragment key={o.value}>
                  {heading ? <div className="eyebrow px-2 pb-1 pt-2">{heading}</div> : null}
                  <button type="button" role="option" aria-selected={on} onClick={() => toggle(String(o.value))} data-option={o.value}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60">
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                      {on ? <Check className="size-3" /> : null}
                    </span>
                    <span className="flex-1">{o.label}</span>
                  </button>
                </Fragment>
              );
            })}
            {shown.length === 0 ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches.</p> : null}
          </div>
          {picked.size ? (
            <button type="button" onClick={() => set(new Set())}
              className="w-full shrink-0 border-t border-[var(--panel-border)] px-3 py-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-primary">
              Clear {group.label.toLowerCase()}
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Same pill as the leads page chips, so filters look alike everywhere. */
function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 hover:-translate-y-px active:scale-95",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

/** Which page numbers to show: the ends, and a window around the current page. */
function pageNumbers(page, pages) {
  const out = [];
  let last = 0;
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) {
      if (n - last > 1) out.push("…");
      out.push(n);
      last = n;
    }
  }
  return out;
}

const pageButton =
  "flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 text-xs font-semibold tabular-nums transition-colors";

function Pager({ paging, searchParams, pathname, onPerPage }) {
  const href = (n) => {
    const params = new URLSearchParams(searchParams.toString());
    if (n > 1) params.set("page", String(n));
    else params.delete("page");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const link = (n, label, children, disabled) =>
    disabled ? (
      <span aria-disabled className={cn(pageButton, "border-[var(--panel-border)] text-muted-foreground/40")}>{children}</span>
    ) : (
      <Link href={href(n)} scroll={false} aria-label={label} className={cn(pageButton, "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary")}>
        {children}
      </Link>
    );

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-[var(--panel-border)] px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2">
          <span className="eyebrow">Rows per page</span>
          <Select
            value={String(paging.perPage)}
            onChange={(e) => onPerPage(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-8 w-auto min-w-20 text-xs"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </label>
        <span className="text-xs text-muted-foreground">Page {paging.page} of {paging.pages}</span>
      </div>
      <div className="flex items-center gap-1">
        {link(paging.page - 1, "Previous page", <ChevronLeft className="size-3.5" />, paging.page <= 1)}
        {pageNumbers(paging.page, paging.pages).map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : n === paging.page ? (
            <span key={n} aria-current="page" className={cn(pageButton, "border-primary bg-primary/10 text-primary")}>{n}</span>
          ) : (
            <Fragment key={n}>{link(n, `Page ${n}`, n, false)}</Fragment>
          )
        )}
        {link(paging.page + 1, "Next page", <ChevronRight className="size-3.5" />, paging.page >= paging.pages)}
      </div>
    </nav>
  );
}
