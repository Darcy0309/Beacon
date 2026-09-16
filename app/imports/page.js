import { Upload, Rows3, CheckCheck, AlertTriangle } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import CsvImport from "@/components/csv-import";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getImports } from "@/lib/queries";

export const dynamic = "force-dynamic";

const statusTone = { Complete: "emerald", Processing: "cyan", Failed: "rose" };

export default async function ImportsPage() {
  const recentImports = await getImports();
  const rows = recentImports.reduce((s, r) => s + r.rows, 0);
  const imported = recentImports.reduce((s, r) => s + r.imported, 0);
  const errors = recentImports.reduce((s, r) => s + r.errors, 0);
  const series = recentImports.map((r) => r.imported).reverse();

  const tiles = [
    { label: "Import Batches", value: String(recentImports.length), note: "files processed",
      icon: Upload, accent: "var(--neon-cyan)", series, bars: true },
    { label: "Rows Received", value: rows.toLocaleString(), note: "across all files",
      icon: Rows3, accent: "var(--neon-violet)", series: recentImports.map((r) => r.rows).reverse() },
    { label: "Leads Imported", value: imported.toLocaleString(), note: `${rows ? Math.round((imported / rows) * 100) : 0}% of rows`,
      icon: CheckCheck, accent: "var(--neon-emerald)", series },
    { label: "Rows Skipped", value: errors.toLocaleString(), note: "failed validation",
      icon: AlertTriangle, accent: "var(--neon-amber)", series: recentImports.map((r) => r.errors).reverse(), bars: true },
  ];

  return (
    <>
      <Topbar title="Imports" sub={`${imported.toLocaleString()} leads imported across ${recentImports.length} batches`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <CsvImport />

        <Card>
          <SectionHeader label="Recent Imports" icon={Upload} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Imported</TableHead>
                <TableHead>Skipped</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentImports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.file}</TableCell>
                  <TableCell className="text-muted-foreground">{r.project}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.rows.toLocaleString()}</TableCell>
                  <TableCell className="font-semibold tabular-nums text-primary">{r.imported.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.errors}</TableCell>
                  <TableCell><ToneBadge tone={statusTone[r.status] ?? "slate"}>{r.status}</ToneBadge></TableCell>
                  <TableCell className="text-muted-foreground">{r.date}</TableCell>
                </TableRow>
              ))}
              {recentImports.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No imports yet — upload a CSV above.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
