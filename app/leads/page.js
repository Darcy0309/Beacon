"use client";

import { useState } from "react";
import { Search, Plus } from "lucide-react";
import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RowActions from "@/components/row-actions";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { leads, STATUS } from "@/lib/data";

const chips = [
  { key: "", label: "All 342" },
  { key: "appt", label: "Phone appt" },
  { key: "survey", label: "Survey" },
  { key: "hot", label: "Hot leads" },
  { key: "xdate", label: "X-date" },
  { key: "new", label: "New" },
];

export default function LeadsPage() {
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");

  const shown = leads.filter((l) => {
    if (filter && l.status !== filter) return false;
    if (!query) return true;
    const hay = `${l.co} ${l.city} ${l.contact} ${STATUS[l.status].label} ${l.rep}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  return (
    <>
      <Topbar title="Leads" sub="342 active leads across 17 clients" />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>All leads</CardTitle>
            <Button size="sm" onClick={() => toast.success("New lead form opened")}>
              <Plus /> New lead
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads…" className="pl-8" aria-label="Search leads" />
              </div>
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setFilter(c.key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 hover:-translate-y-px active:scale-95",
                      filter === c.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
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
                  {shown.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: l.color }}>{l.initials}</span>
                          <div>
                            <div className="font-medium">{l.co}</div>
                            <div className="text-xs text-muted-foreground">{l.city}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{l.contact}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{l.phone}</TableCell>
                      <TableCell><StatusBadge status={l.status} /></TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{l.xdate}</TableCell>
                      <TableCell className={l.rep === "Unassigned" ? "text-muted-foreground" : ""}>{l.rep}</TableCell>
                      <TableCell className="text-right">
                        <RowActions name={l.co} href={`/leads/${l.id}`} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {shown.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No leads match your search.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
