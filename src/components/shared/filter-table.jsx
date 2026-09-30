"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PAGE_SIZE, PAGE_SIZES } from "@/lib/paging";

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
 * fall back to a select; set `kind: "chips" | "select"` to force one.
 */
const CHIP_LIMIT = 6;
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
}) {
  const server = Boolean(paging);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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
  const onPick = (key, value) => {
    const next = { ...picked, [key]: value };
    setPicked(next);
    if (!server) return;
    clearTimeout(timer.current);
    navigate(q.trim(), next);
  };
  const reset = () => {
    setQ("");
    setPicked({});
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
        return { ...f, options, kind };
      }),
    [filters, rows]
  );

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = server
    ? rows
    : rows.filter((r) => {
        for (const f of filters) {
          const want = picked[f.key];
          if (want && String(r.facets?.[f.key] ?? "") !== want) return false;
        }
        if (terms.length === 0) return true;
        const hay = String(r.search ?? "").toLowerCase();
        return terms.every((t) => hay.includes(t));
      });

  const active = terms.length > 0 || Object.values(picked).some(Boolean);
  const heads = columns.map((c) => (typeof c === "string" ? { label: c } : c));

  let summary;
  if (server) summary = paging.total ? `${paging.from}–${paging.to} of ${paging.total}` : "0 results";
  else summary = active ? `${shown.length} of ${rows.length}` : `${rows.length} total`;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--panel-border)] px-5 py-3">
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

        {groups.map((g) => (
          <FacetGroup key={g.key} group={g} value={picked[g.key] ?? ""} onChange={(v) => onPick(g.key, v)} />
        ))}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums" aria-live="polite">{summary}</span>
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
