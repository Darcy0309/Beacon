import { UploadCloud } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import ToastButton from "@/components/toast-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { recentImports } from "@/lib/data";

const statusTone = { Complete: "emerald", Processing: "sky", Failed: "rose" };

export default function ImportsPage() {
  return (
    <>
      <Topbar title="Imports" sub="Bring lead and client lists into Beacon" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border py-10 text-center">
              <UploadCloud className="size-8 text-muted-foreground" />
              <div>
                <div className="font-medium">Drag & drop a CSV file</div>
                <div className="text-sm text-muted-foreground">or browse to upload · leads, clients, or X-date lists</div>
              </div>
              <ToastButton size="sm" variant="outline" type="message" message="File browser opened">Browse files</ToastButton>
            </div>
          </CardContent>
        </Card>

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
