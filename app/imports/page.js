import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import CsvImport from "@/components/csv-import";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getImports } from "@/lib/queries";

const statusTone = { Complete: "emerald", Processing: "sky", Failed: "rose" };

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const recentImports = await getImports();
  return (
    <>
      <Topbar title="Imports" sub="Bring lead and client lists into Beacon" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <CsvImport />

        <Card>
          <CardHeader><CardTitle>Recent imports</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentImports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.file}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{r.rows.toLocaleString()}</TableCell>
                    <TableCell><ToneBadge tone={statusTone[r.status]}>{r.status}</ToneBadge></TableCell>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="text-right"><RowActions name={r.file} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
