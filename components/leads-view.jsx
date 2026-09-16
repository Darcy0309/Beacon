"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import StatusBadge from "@/components/status-badge";
import RowActions from "@/components/row-actions";
import LeadForm from "@/components/lead-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { deleteLead } from "@/lib/actions";
import { colorFor, initials, cityState, shortDate, shortName } from "@/lib/display";

export default function LeadsView({ leads, options, counts, total }) {
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");

  const chips = useMemo(
    () => [
      { key: "", label: `All ${total}` },
      ...(options.statuses ?? []).map((s) => ({
        key: s.code,
        label: `${s.name}${counts?.[s.code] ? ` ${counts[s.code]}` : ""}`,
      })),
    ],
    [options.statuses, counts, total]
  );

  const shown = leads.filter((l) => {
    if (filter && l.status?.code !== filter) return false;
    if (!query) return true;
    const hay = [
      l.company_name, l.city, l.state, l.contact_name, l.phone,
      l.status?.name, shortName(l.assigned), l.project?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>All leads</CardTitle>
        <LeadForm options={options} />
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search leads…"
              className="pl-8"
              aria-label="Search leads"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c.key || "all"}
                type="button"
                onClick={() => setFilter(c.key)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors active:scale-95",
                  filter === c.key
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/80 bg-muted/30 text-muted-foreground hover:bg-muted"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>X-Date</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((l) => {
                const rep = shortName(l.assigned);
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white"
                          style={{ background: colorFor(l.company_name || "") }}
                        >
                          {initials(l.company_name || "")}
                        </span>
                        <div>
                          <div className="font-medium">{l.company_name}</div>
                          <div className="text-xs text-muted-foreground">{cityState(l)}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{l.contact_name ?? "—"}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{l.phone ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{shortDate(l.xdate)}</TableCell>
                    <TableCell className={rep === "Unassigned" ? "text-muted-foreground" : ""}>{rep}</TableCell>
                    <TableCell className="text-right">
                      <RowActions name={l.company_name} href={`/leads/${l.id}`} id={l.id} onDelete={deleteLead} />
                    </TableCell>
                  </TableRow>
                );
              })}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No leads match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
