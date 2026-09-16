import { FileText } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDocuments } from "@/lib/queries";
import { deleteDocument } from "@/lib/actions";
import { fileSize, longDate, fullName } from "@/lib/display";
import { DOC_TONE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const documents = await getDocuments();

  return (
    <>
      <Topbar title="Documents" sub={`${documents.length} lead sheets, contracts, and assets`} />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>All documents</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded by</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{d.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {d.file_type ? (
                        <ToneBadge tone={DOC_TONE[d.file_type] ?? "slate"}>{d.file_type}</ToneBadge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className={d.company ? "" : "text-muted-foreground"}>
                      {d.company?.name ?? "—"}
                    </TableCell>
                    <TableCell className={d.project ? "" : "text-muted-foreground"}>
                      {d.project?.name ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {fileSize(d.size_bytes)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fullName(d.uploader)}</TableCell>
                    <TableCell className="text-muted-foreground">{longDate(d.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <RowActions name={d.name} id={d.id} onDelete={deleteDocument} />
                    </TableCell>
                  </TableRow>
                ))}
                {documents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No documents yet.
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
