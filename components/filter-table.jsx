"use client";

import { Fragment, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
 * Facet options and their counts are derived from the rows. A facet with up
 * to CHIP_LIMIT distinct values renders as a chip row, larger ones fall back
 * to a select; set `kind: "chips" | "select"` on a filter to force one.
 */
const CHIP_LIMIT = 6;

export default function FilterTable({
  columns,
  rows,
  filters = [],
  placeholder = "Search…",
  empty = "Nothing here yet.",
  className,
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState({});

  // Distinct values per facet, most common first. Counted over every row so
  // the chips hold still while the user narrows the table.
  const groups = useMemo(
    () =>
      filters.map((f) => {
        const counts = new Map();
        for (const r of rows) {
          const v = r.facets?.[f.key];
          if (v == null || v === "") continue;
          counts.set(String(v), (counts.get(String(v)) || 0) + 1);
        }
        const options = [...counts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count }));
        const kind = f.kind ?? (options.length > CHIP_LIMIT ? "select" : "chips");
        return { ...f, options, kind };
      }),
    [filters, rows]
  );

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) => {
    for (const f of filters) {
      const want = picked[f.key];
      if (want && String(r.facets?.[f.key] ?? "") !== want) return false;
    }
    if (terms.length === 0) return true;
    const hay = String(r.search ?? "").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });

  const active = terms.length > 0 || Object.values(picked).some(Boolean);
  const pick = (key, value) => setPicked((p) => ({ ...p, [key]: value }));
  const reset = () => {
    setQuery("");
    setPicked({});
  };

  const heads = columns.map((c) => (typeof c === "string" ? { label: c } : c));

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--panel-border)] px-5 py-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-8 pl-8"
          />
        </div>

        {groups.map((g) => (
          <FacetGroup key={g.key} group={g} value={picked[g.key] ?? ""} onChange={(v) => pick(g.key, v)} />
        ))}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">{active ? `${shown.length} of ${rows.length}` : `${rows.length} total`}</span>
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

      <Table>
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
                {rows.length === 0 ? empty : "Nothing matches your filters."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
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
              {o.value} ({o.count})
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
          {o.value}
          <span className="ml-1.5 tabular-nums opacity-60">{o.count}</span>
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
