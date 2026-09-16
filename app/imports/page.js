import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import CsvImport from "@/components/csv-import";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getImports, getLookups } from "@/lib/queries";
import { fullName, timeAgo } from "@/lib/display";
import { IMPORT_TONE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const [batches, options] = await Promise.all([getImports(), getLookups()]);
  const totalImported = batches.reduce((s, b) => s + (b.imported_count ?? 0), 0);

  return (
    <>
      <Topbar
        title="Imports"
        sub={`${totalImported.toLocaleString()} leads imported across ${batches.length} batches`}
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <CsvImport projects={options.projects} />

        <Card>
          <CardHeader>
            <CardTitle>Recent imports</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.file_name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.project?.name ?? "—"}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {(r.row_count ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="tabular-nums">{(r.imported_count ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{r.error_count ?? 0}</TableCell>
                    <TableCell>
                      <ToneBadge tone={IMPORT_TONE[r.status] ?? "slate"}>{r.status}</ToneBadge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fullName(r.importer)}</TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                  </TableRow>
                ))}
                {batches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No imports yet — upload a CSV above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
